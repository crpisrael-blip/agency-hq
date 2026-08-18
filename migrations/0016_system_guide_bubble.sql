-- לינק למדריך למערכת + סימון שיש בועת רעיונות (לשילוב בהודעת המסירה)
ALTER TABLE systems ADD COLUMN guide_url TEXT;
ALTER TABLE systems ADD COLUMN idea_bubble INTEGER NOT NULL DEFAULT 0;
