import 'reflect-metadata';
import * as chai from 'chai';
import { Sequelize, Model, Column, DataType, PrimaryKey, AutoIncrement } from 'sequelize-typescript';
import { Table } from '../model/model-base';
import { RequestContext } from '../request-context';
import 'mocha';

// A: user explicitly declared `updatedBy` with custom options (type/db-field must be preserved)
@Table()
class AccountA extends Model {
  @AutoIncrement @PrimaryKey @Column({ type: DataType.INTEGER }) declare id: number;

  @Column({ type: DataType.STRING }) declare name: string;

  @Column({ type: DataType.STRING, field: 'updated_by_col' }) declare updatedBy: string;
}

// B: relies on the auto-declared `updatedBy` column
@Table()
class AccountB extends Model {
  @AutoIncrement @PrimaryKey @Column({ type: DataType.INTEGER }) declare id: number;

  @Column({ type: DataType.STRING }) declare name: string;
}

// C: custom stamp column name
@Table({ updatedBy: 'auditor' })
class AccountC extends Model {
  @AutoIncrement @PrimaryKey @Column({ type: DataType.INTEGER }) declare id: number;

  @Column({ type: DataType.STRING }) declare name: string;
}

// D: audit disabled
@Table({ updatedBy: false })
class AccountD extends Model {
  @AutoIncrement @PrimaryKey @Column({ type: DataType.INTEGER }) declare id: number;

  @Column({ type: DataType.STRING }) declare name: string;
}

// The E2E suite runs against an in-memory SQLite database. The `sqlite3` driver
// is an optional, dev-only native module; when it is not installed the whole
// suite is skipped so `npm test` stays green on minimal installs.
let sqliteAvailable = false;
try {
  // Optional dev-only native driver; probing it at runtime (not a static
  // import) lets the suite skip cleanly when it is not installed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('sqlite3');
  sqliteAvailable = true;
} catch {
  sqliteAvailable = false;
}

const suite = sqliteAvailable ? describe : describe.skip;

suite('model-base audit stamping', () => {
  const userId = 'user-123';

  let sequelize: Sequelize;
  const A = AccountA as any;
  const B = AccountB as any;
  const C = AccountC as any;
  const D = AccountD as any;

  const as = (row: Model): any => row;

  before(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    sequelize.addModels([AccountA, AccountB, AccountC, AccountD]);
    await sequelize.sync({ force: true });
  });

  after(async () => {
    await sequelize.close();
  });

  it('preserves a user-declared updatedBy column (type + db field)', () => {
    const attr = A.rawAttributes['updatedBy'];
    chai.expect(attr).to.exist;
    // If declareUpdatedByColumn had clobbered the declaration, the type would be
    // UUID and the custom db field would be gone
    chai.expect(attr.type instanceof DataType.STRING).to.equal(true, 'user column type must be preserved');
    chai.expect(attr.field).to.equal('updated_by_col');
  });

  it('auto-declares updatedBy when the user did not declare it', () => {
    chai.expect(B.rawAttributes['updatedBy']).to.exist;
    chai.expect(C.rawAttributes['auditor']).to.exist;
  });

  it('does not declare any stamp column when audit is disabled', () => {
    chai.expect('updatedBy' in D.rawAttributes).to.equal(false);
  });

  it('stamps updatedBy on create', async () => {
    const row = await RequestContext.run({ userId }, () => A.create({ name: 'a1' }));
    chai.expect(as(row).updatedBy).to.equal(userId);
  });

  it('stamps updatedBy on instance.update', async () => {
    const row = await A.create({ name: 'upd' });
    await RequestContext.run({ userId }, () => as(row).update({ name: 'upd2' }));
    const fresh = await A.findByPk(row.id);
    chai.expect(as(fresh).updatedBy).to.equal(userId);
    chai.expect(as(fresh).name).to.equal('upd2');
  });

  it('stamps updatedBy on save()', async () => {
    const inst = A.build({ name: 'save1' });
    const saved = await RequestContext.run({ userId }, () => as(inst).save());
    chai.expect(as(saved).updatedBy).to.equal(userId);
  });

  it('stamps updatedBy on bulkCreate', async () => {
    const rows = await RequestContext.run({ userId }, () => A.bulkCreate([{ name: 'bc1' }, { name: 'bc2' }]));
    rows.forEach((r: Model) => {
      chai.expect(as(r).updatedBy).to.equal(userId);
    });
  });

  it('stamps updatedBy on bulk update', async () => {
    const created = await A.create({ name: 'bu' });
    await RequestContext.run({ userId }, () => A.update({ name: 'bu2' }, { where: { id: created.id } }));
    const fresh = await A.findByPk(created.id);
    chai.expect(as(fresh).updatedBy).to.equal(userId);
    chai.expect(as(fresh).name).to.equal('bu2');
  });

  it('stamps updatedBy on upsert (update path)', async () => {
    const created = await A.create({ name: 'ups' });
    await RequestContext.run({ userId }, () => A.upsert({ id: created.id, name: 'ups2' }));
    const fresh = await A.findByPk(created.id);
    chai.expect(as(fresh).updatedBy).to.equal(userId);
    chai.expect(as(fresh).name).to.equal('ups2');
  });

  it('stamps updatedBy on upsert (insert path)', async () => {
    await RequestContext.run({ userId }, () => A.upsert({ name: 'ups-new' }));
    const found = await A.findOne({ where: { name: 'ups-new' } });
    chai.expect(found).to.exist;
    chai.expect(as(found).updatedBy).to.equal(userId);
  });

  it('stamps the auto-declared updatedBy (model B)', async () => {
    const row = await RequestContext.run({ userId }, () => B.create({ name: 'b1' }));
    chai.expect(as(row).updatedBy).to.equal(userId);
  });

  it('stamps the custom-named column (model C)', async () => {
    const row = await RequestContext.run({ userId }, () => C.create({ name: 'c1' }));
    chai.expect(as(row).auditor).to.equal(userId);
  });

  it('leaves rows untouched without an ambient request context', async () => {
    const row = await A.create({ name: 'noc' });
    // Not stamped: the in-memory instance leaves the attribute unset...
    chai.expect(as(row).updatedBy).to.equal(undefined);
    // ...and the persisted value is NULL
    const fresh = await A.findByPk(row.id);
    chai.expect(as(fresh).updatedBy).to.equal(null);
  });
});
