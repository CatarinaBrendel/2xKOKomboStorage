// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  app_lib::run();
}

  #[cfg(test)]
  mod tests {
    use rusqlite::Connection;

    #[test]
    fn sqlite_in_memory() -> Result<(), Box<dyn std::error::Error>> {
      // create an in-memory database, create table, insert and query
      let conn = Connection::open_in_memory()?;
      conn.execute(
        "CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
        [],
      )?;
      conn.execute("INSERT INTO items (name) VALUES (?1)", rusqlite::params!["test"]).unwrap();
      let mut stmt = conn.prepare("SELECT name FROM items")?;
      let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
      let mut items = Vec::new();
      for r in rows {
        items.push(r?);
      }
      assert_eq!(items, vec!["test".to_string()]);
      Ok(())
    }
  }
