' ==============================================
'  ModAccessLog - VBA Module
'  ייבוא: ב-Access פתח VBE (Alt+F11) > File > Import File > בחר קובץ זה
' ==============================================
Attribute VB_Name = "ModAccessLog"
Option Compare Database
Option Explicit

' מתעד כניסה חדשה בטבלה ומרענן את הטופס
Public Sub LogEntry(Optional ByVal sNote As String = "")
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim dtNow As Date

    Set db = CurrentDb
    Set rs = db.OpenRecordset("tblAccessLog", dbOpenDynaset)

    dtNow = Now()

    rs.AddNew
        rs!LogDate = dtNow
        rs!WeekDay = Format(dtNow, "dddd")
        If Len(sNote) > 0 Then rs!Note = sNote
    rs.Update

    rs.Close
    Set rs = Nothing
    Set db = Nothing
End Sub

' מחזיר את מספר הכניסות להיום
Public Function TodayCount() As Long
    TodayCount = Nz(DCount("LogID", "tblAccessLog", "Int(LogDate) = Int(Date())"), 0)
End Function

' מחזיר את מספר הכניסות לשבוע הנוכחי
Public Function WeekCount() As Long
    Dim dtStart As Date
    dtStart = Date - Weekday(Date, vbSunday) + 1
    WeekCount = Nz(DCount("LogID", "tblAccessLog", "LogDate >= #" & Format(dtStart, "mm/dd/yyyy") & "#"), 0)
End Function

' מחזיר את מספר הכניסות לחודש הנוכחי
Public Function MonthCount() As Long
    Dim dtStart As Date
    dtStart = DateSerial(Year(Date), Month(Date), 1)
    MonthCount = Nz(DCount("LogID", "tblAccessLog", "LogDate >= #" & Format(dtStart, "mm/dd/yyyy") & "#"), 0)
End Function

' מוחק את כל הרשומות (אישור לפני)
Public Sub ClearLog()
    If MsgBox("למחוק את כל היומן?", vbYesNo + vbExclamation, "אישור מחיקה") = vbYes Then
        CurrentDb.Execute "DELETE FROM tblAccessLog", dbFailOnError
    End If
End Sub
