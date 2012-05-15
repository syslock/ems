import sqlite3, time, re, socket, imp
from lib import password
password = imp.reload( password ) # DEBUG
from lib import errors
errors = imp.reload( errors )
from lib import db_object
db_object = imp.reload( db_object )

class User( db_object.DBObject ):
	def __init__( self, app, user_id=None, nick=None, plain_password=None, 
					email=None ):
		if( user_id!=None ):
			super().__init__( app, object_id=user_id )
		else:
			super().__init__( app, media_type="application/x-obj.user" )
			self.check( self.app, nick, plain_password, email )
			encrypted_password = password.encrypt( plain_password )
			try:
				c.execute( """insert into users (object_id,nick,password,email)
								values (?,?,?,?,?)""",
							[self.id, nick, encrypted_password, email] )
			except sqlite3.IntegrityError as e:
				raise Exception( "Nick already in use" )
			self.app.db.commit()
	
	def status( self ):
		result = {}
		c = self.app.db.cursor()
		c.execute( """select object_id, nick, email from users where object_id=?""", 
					[self.id] )
		for row in c:
			result["login"] = { 
				"id" : row[0],
				"nick" : row[1],
				"email" : row[2] }
		visible_objects = []
		for row in self.can_read():
			visible_objects.append( row[0] )
		result["visible_objects"] = visible_objects
		return result
	
	@classmethod
	def check( cls, app, nick, password, email ):
		c = app.db.cursor()
		c.execute( """select object_id from users where nick=?""", [nick] )
		if c.fetchall():
			raise Exception( "Nick already in use" )
		if len(password)<6:
			raise Exception( "Password has to be at least 6 characters long" )
		if not re.findall( "[a-zA-Z]", password ):
			raise Exception( "Password must contain latin letters" )
		if not re.findall( "[0-9]", password ):
			raise Exception( "Password must contain decimal digits" )
		if not re.findall( "[^a-zA-Z0-9]", password ):
			raise Exception( "Password must contain special charactes" )
		if not "@" in email:
			raise Exception( "Invalid email address" )
		name, host = email.split("@")
		if not name or not host:
			raise Exception( "Invalid email address" )
		socket.gethostbyname( host ) # Wirft Socket-Error bei unauflösbaren Hostnamen
		return True
	
	def can_read( self, object_id=None ):
		return self.can_access( object_id, "read" )
	def can_write( self, object_id=None ):
		return self.can_access( object_id, "write" )
	def can_delete( self, object_id ):
		"""Ein Objekt ist löschbar, wenn es selbst und alle Eltern schreibbar sind."""
		c = self.app.db.cursor()
		c.execute( """select parent_id from membership where child_id=?""",
					[object_id] )
		deletable = self.can_write( object_id )
		has_parent = False
		for row in c:
			has_parent = True
			if not deletable:
				break
			parent_id = row[0]
			deletable = deletable and self.can_write( parent_id )
		return deletable and has_parent
	def can_access( self, object_id, access_type ):
		if access_type not in ("read", "write"):
			raise NotImplementedError( "Unsupported access_type" )
		c = self.app.db.cursor()
		# mehrstufiger join zur gleichzeitigen Auflösung von bis zu 10
		# Verschachtelungsstufen der jeweiligen Zugriffsgruppe:
		object_constraint = "1=1"
		null_access = "1=0"
		if object_id!=None:
			object_constraint = "o.id=%(object_id)d" % locals()
			null_access = "o.%(access_type)s is null" % locals()
		user_id = self.id
		c.execute( """select o.id, o.%(access_type)s from objects o
						left join membership m0 on o.%(access_type)s=m0.parent_id
						left join membership m1 on m0.child_id=m1.parent_id
						left join membership m2 on m1.child_id=m2.parent_id
						left join membership m3 on m2.child_id=m3.parent_id
						left join membership m4 on m3.child_id=m4.parent_id
						left join membership m5 on m4.child_id=m5.parent_id
						left join membership m6 on m5.child_id=m6.parent_id
						left join membership m7 on m6.child_id=m7.parent_id
						left join membership m8 on m7.child_id=m8.parent_id
						left join membership m9 on m8.child_id=m9.parent_id
						where %(object_constraint)s
							and (%(null_access)s
								or o.%(access_type)s=%(user_id)d
								or m0.child_id=%(user_id)d
								or m1.child_id=%(user_id)d
								or m2.child_id=%(user_id)d
								or m3.child_id=%(user_id)d
								or m4.child_id=%(user_id)d
								or m5.child_id=%(user_id)d
								or m6.child_id=%(user_id)d
								or m7.child_id=%(user_id)d
								or m8.child_id=%(user_id)d
								or m9.child_id=%(user_id)d
								)""" \
					% locals() )
		if object_id==None:
			# Falls keine object_id übergeben wurde, geben wir die direkt
			# entsprechend zugreifbaren Object-IDs, zusammen mit den dafür
			# verantwortlichen Zugriffs-IDs zurück 
			return c.fetchall()
		result = c.fetchone()
		if not result:
			return False
		access_id = result[1]
		if access_id == None:
			parent_id = None
			c.execute( """select m.parent_id from objects o
							left join membership m on o.id=m.child_id
							where o.id=?""", [object_id] )
			for row in c:
				parent_id = row[0]
				if parent_id == object_id \
				or not self.can_access( parent_id, access_type ):
					return False
			if parent_id == None:
				return False
		return True
	
	def grant_read( self, object_id ):
		self.grant_access( object_id, "read" )
	def grant_write( self, object_id ):
		self.grant_access( object_id, "write" )
	def grant_access( self, object_id, access_type ):
		if access_type not in ("read", "write"):
			raise NotImplementedError( "Unsupported access_type" )
		c = self.app.db.cursor()
		c.execute( """update objects set %(access_type)s=? where id=?""" \
						% locals(),
					[self.id, object_id] )
		self.app.db.commit()

