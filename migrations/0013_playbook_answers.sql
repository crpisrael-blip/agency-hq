-- תשובות לכל פריט במהלך: JSON { "si-ii": "הטקסט שכתבתי" }
-- זה מה שהופך צ׳ק־ליסט לטופס מלא שאפשר לייצא ולשלוח.
ALTER TABLE playbook_runs ADD COLUMN answers TEXT NOT NULL DEFAULT '{}';
