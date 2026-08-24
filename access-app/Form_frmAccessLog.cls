' ==============================================
'  Form_frmAccessLog - VBA code-behind for the main form
'  ייבוא: צור טופס בשם frmAccessLog, פתח VBE, הדבק את הקוד בחלון הטופס
' ==============================================
Option Compare Database
Option Explicit

' ===== FORM EVENTS =====

Private Sub Form_Open(Cancel As Integer)
    RefreshStats
    Me.TimerInterval = 1000  ' עדכון שעון כל שנייה
End Sub

Private Sub Form_Timer()
    ' שעון חי
    Me.lblClock.Caption = Format(Now(), "HH:mm:ss")
    Me.lblDate.Caption = Format(Now(), "dddd, d MMMM yyyy")
End Sub

' ===== BUTTON EVENTS =====

Private Sub btnLog_Click()
    Call ModAccessLog.LogEntry
    Me.subLog.Requery
    RefreshStats
    FlashButton
End Sub

Private Sub btnLogWithNote_Click()
    Dim sNote As String
    sNote = InputBox("הערה (אופציונלי):", "תיעוד כניסה")
    If StrPtr(sNote) <> 0 Then  ' לא לחצו Cancel
        Call ModAccessLog.LogEntry(sNote)
        Me.subLog.Requery
        RefreshStats
        FlashButton
    End If
End Sub

Private Sub btnClear_Click()
    Call ModAccessLog.ClearLog
    Me.subLog.Requery
    RefreshStats
End Sub

' ===== HELPERS =====

Private Sub RefreshStats()
    Me.lblToday.Caption = ModAccessLog.TodayCount()
    Me.lblWeek.Caption = ModAccessLog.WeekCount()
    Me.lblMonth.Caption = ModAccessLog.MonthCount()
End Sub

Private Sub FlashButton()
    Me.btnLog.BackColor = RGB(0, 180, 160)
    Me.btnLog.ForeColor = RGB(255, 255, 255)
    Me.TimerInterval = 200
    DoEvents
    Pause 0.15
    Me.btnLog.BackColor = RGB(230, 245, 243)
    Me.btnLog.ForeColor = RGB(0, 120, 107)
    Me.TimerInterval = 1000
End Sub

Private Sub Pause(dSeconds As Double)
    Dim dtEnd As Date
    dtEnd = Timer + dSeconds
    Do While Timer < dtEnd
        DoEvents
    Loop
End Sub
