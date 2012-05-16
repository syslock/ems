import imp
from lib import db_object
db_object = imp.reload( db_object )

class Contact( db_object.UserAttributes ):
	table = "contacts"
	media_type = "application/x-obj.iswi.contact"
	valid_fields = { "name_title", "first_name", "surname", "birthday", 
		"gender", "nationality", "country", "region", "city", "postal_code", 
		"street", "telephone1", "telephone2" }

class Application( db_object.UserAttributes ):
	table = "applications"
	media_type = "application/x-obj.iswi.application"
	valid_fields = { "statement_id", "motivation_id", "motto_id",
		"university_name", "study_field", "study_years", "study_field", 
		"study_finish", "topic1_id", "topic2_id", "topic3_id", 
		"accommodation", "food", "comment", "abstract_id", "cultural_id", 
		"conferences_id" }

