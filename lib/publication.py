from lib import errors
from lib import db_object
from lib import application

class Publication( db_object.DBObject ):
	media_type = "application/x-obj.publication"
	def __init__( self, app, **keyargs ):
		keyargs["media_type"] = self.media_type
		super().__init__( app, **keyargs )
	def update( self, **keyargs ):
		super().update( **keyargs )
		if self.get_data()==None:
			pub_session = application.Session( self.app )
			pub_session.parms["subject_id"] = str(self.id)
			pub_session.store()
			for parent_id in keyargs["parent_id"]:
				self.grant_read( parent_id )
	def get_data( self ):
		c = self.app.db.cursor()
		c.execute( """select sid from session_parms where key=? and value=?""", 
			['subject_id',self.id] )
		result = c.fetchone()
		if not result:
			return None
		else:
			return result[0]
db_object.DBObject.register_class( Publication )
