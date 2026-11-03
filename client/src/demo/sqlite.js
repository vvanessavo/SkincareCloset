// The parts of better-sqlite3's API the server uses, on top of sql.js.

function toBindings(args) {
  const clean = (value) => (value === undefined ? null : value);
  if (args.length === 1 && Array.isArray(args[0])) return args[0].map(clean);
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object') {
    return Object.fromEntries(Object.entries(args[0]).map(([key, value]) => [`@${key}`, clean(value)]));
  }
  return args.map(clean);
}

// better-sqlite3 tags constraint errors with a code, which the routes check.
function withCode(error) {
  if (/FOREIGN KEY constraint failed/.test(error.message)) error.code = 'SQLITE_CONSTRAINT_FOREIGNKEY';
  return error;
}

export function wrapDatabase(sqlDb) {
  // Statements are prepared per call because sql.js frees them all on export().
  function query(sql, args, { pluck, all }) {
    const statement = sqlDb.prepare(sql);
    try {
      statement.bind(toBindings(args));
      const rows = [];
      while (statement.step()) {
        rows.push(pluck ? statement.get()[0] : statement.getAsObject());
        if (!all) break;
      }
      return all ? rows : rows[0];
    } catch (error) {
      throw withCode(error);
    } finally {
      statement.free();
    }
  }

  function prepare(sql, pluck = false) {
    return {
      get: (...args) => query(sql, args, { pluck, all: false }),
      all: (...args) => query(sql, args, { pluck, all: true }),
      run(...args) {
        query(sql, args, { pluck: false, all: true });
        return {
          changes: sqlDb.getRowsModified(),
          lastInsertRowid: sqlDb.exec('SELECT last_insert_rowid()')[0].values[0][0],
        };
      },
      pluck: () => prepare(sql, true),
    };
  }

  return {
    prepare: (sql) => prepare(sql),
    exec(sql) {
      sqlDb.exec(sql);
    },
    transaction(fn) {
      return (...args) => {
        sqlDb.exec('BEGIN');
        try {
          const result = fn(...args);
          sqlDb.exec('COMMIT');
          return result;
        } catch (error) {
          sqlDb.exec('ROLLBACK');
          throw error;
        }
      };
    },
  };
}
