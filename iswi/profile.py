from lib import db_object

class Contact( db_object.UserAttributes ):
	table = "contacts"
	media_type = "application/x-obj.iswi.contact"
	valid_fields = { "name_title", "first_name", "surname", 
		"birth_year", "birth_month", "birth_day", 
		"gender", "nationality", "country", "region", "city", "postal_code", 
		"street", "telephone1", "telephone2" }
db_object.DBObject.register_class( Contact )

class Application( db_object.UserAttributes ):
	table = "applications"
	media_type = "application/x-obj.iswi.application"
	valid_fields = { "statement_id", "motivation_id", "motto_id",
		"university_name", "study_field", "study_finish_year", 
		"study_finish_month", "accommodation", "food", "abstract_id" }
db_object.DBObject.register_class( Application )

