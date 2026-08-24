-- ==============================================
--  tblAccessLog - יומן כניסות
--  הרץ את ה-SQL הזה ב-Access: Create > Query Design > SQL View > הדבק > Run
-- ==============================================

CREATE TABLE tblAccessLog (
    LogID       AUTOINCREMENT PRIMARY KEY,
    LogDate     DATETIME NOT NULL,
    WeekDay     TEXT(10),
    Note        TEXT(255)
);
