-- ==============================================
--  tblAccessLog - יומן כניסות
--  הרץ את ה-SQL הזה ב-Access: Create > Query Design > SQL View > הדבק > Run
-- ==============================================

CREATE TABLE tblAccessLog (
    LogID       COUNTER PRIMARY KEY,
    LogDate     DATETIME,
    WeekDay     TEXT(10),
    Note        TEXT(255)
);
