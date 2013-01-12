import sqlite3, time, re, socket, imp
from lib import password
password = imp.reload( password ) # DEBUG
from lib import errors
errors = imp.reload( errors )
from lib import db_object
db_object = imp.reload( db_object )

class User( db_object.DBObject ):
	media_type = "application/x-obj.user"
	def __init__( self, app, user_id=None, nick=None, plain_password=None, 
					email=None ):
		if( user_id!=None ):
			super().__init__( app, object_id=user_id )
		else:
			self.check( app, nick, plain_password, email )
			super().__init__( app, media_type=self.media_type )
			encrypted_password = password.encrypt( plain_password )
			try:
				c = self.app.db.cursor()
				c.execute( """insert into users (object_id,nick,password,email)
								values (?,?,?,?)""",
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
		result["visible_objects"] = self.can_read()
		return result
	
	def update( self, **keyargs ):
		c = self.app.db.cursor()
		if "email" in keyargs:
			email = keyargs["email"]
			User.check_email( email )
			c.execute( """update users set email=? where object_id=?""", [email, self.id] )
			self.app.db.commit()
		if "new_password" in keyargs:
			new_password = keyargs["new_password"]
			User.check_password( new_password )
			encrypted_new_password = password.encrypt( new_password )
			if not "user_id" in self.app.session.parms:
				raise errors.AuthenticationNeeded()
			user_id = int(self.app.session.parms["user_id"])
			if user_id==self.id:
				if not "old_password" in keyargs:
					raise errors.PrivilegeError( "You need to authorize the change request with your old password" )
				old_password = keyargs["old_password"]
				encrypted_old_password = c.execute( """select password from users where object_id=?""", [self.id] ).fetchone()[0]
				if not password.check( old_password, encrypted_old_password ):
					raise errors.PrivilegeError( "Invalid old password" )
			c.execute( """update users set password=? where object_id=?""", [encrypted_new_password, self.id] )
			self.app.db.commit()
		if "avatar_id" in keyargs:
			avatar_id = int( keyargs["avatar_id"] )
			if self.can_read( avatar_id ):
				obj = db_object.DBObject( self.app, object_id=avatar_id )
				if db_object.File.supports(self.app, obj.media_type) and obj.media_type.startswith("image/"):
					file_obj = db_object.File( self.app, object_id=obj.id )
					size_limit = 100*2**10
					if file_obj.get_size() <= size_limit:
						c.execute( """update users set avatar_id=? where object_id=?""", [avatar_id, self.id] )
						self.app.db.commit()
					else:
						raise errors.ParameterError( "Avatar object exeeds size limit of %d bytes" % (size_limit) )
				else:
					raise errors.ParameterError( "Unsupported media type for user avatars" )
			else:
				raise errors.PrivilegeError()
	
	@classmethod
	def check_password( cls, password ):
		if len(password)<8:
			raise Exception( "Password has to be at least 8 characters long" )
		#if not re.findall( "[a-zA-Z]", password ):
		#	raise Exception( "Password must contain latin letters" )
		#if not re.findall( "[0-9]", password ):
		#	raise Exception( "Password must contain decimal digits" )
		#if not re.findall( "[^a-zA-Z0-9]", password ):
		#	raise Exception( "Password must contain special charactes" )
	
	@classmethod
	def check_email( cls, email ):
		if not "@" in email:
			raise Exception( "Invalid email address" )
		name, host = email.split("@")
		if not name or not host:
			raise Exception( "Invalid email address" )
		socket.gethostbyname( host ) # Wirft Socket-Error bei unauflösbaren Hostnamen
	
	@classmethod
	def check( cls, app, nick, password, email ):
		c = app.db.cursor()
		c.execute( """select object_id from users where nick=?""", [nick] )
		if c.fetchall():
			raise Exception( "Nick already in use" )
		User.check_password( password )
		User.check_email( email )
		return True
	
	ACCESS_MASKS={ "read" : 1, "write" : 2 }
	def can_read( self, object_id=None, limit=None ):
		return self.can_access( object_id, "read", limit=limit )
	def can_write( self, object_id=None, limit=None ):
		return self.can_access( object_id, "write", limit=limit )
	def can_delete( self, object_id, limit=None ):
		"""Ein Objekt ist löschbar, wenn es selbst und alle Eltern schreibbar sind."""
		c = self.app.db.cursor()
		c.execute( """select parent_id from membership where child_id=?""",
					[object_id] )
		deletable = self.can_write( object_id, limit=limit )
		has_parent = False
		for row in c:
			has_parent = True
			if not deletable:
				break
			parent_id = row[0]
			deletable = deletable and self.can_write( parent_id, limit=limit )
		return deletable and has_parent
	def can_access( self, object_id, access_type, limit=None ):
		if access_type not in self.ACCESS_MASKS:
			raise NotImplementedError( "Unsupported access_type" )
		access_mask = self.ACCESS_MASKS[ access_type ]
		c = self.app.db.cursor()
		subjects = [self.id] + self.resolve_parents()
		subject_constraint = "subject_id in %s" % str(tuple(subjects)).replace(",)",")")
		objects = object_id and ([object_id] + self.resolve_parents(object_id)) or [None]
		for object_id in objects:
			object_constraint = "1=1"
			if object_id != None:
				object_constraint = "object_id=%(object_id)d" % locals()
			c.execute( """select subject_id, object_id, access_mask
							from permissions
							inner join objects on permissions.object_id=objects.id
							where %(object_constraint)s and %(subject_constraint)s
							order by objects.mtime desc""" \
						% locals() )
			if object_id==None:
				# Falls keine object_id übergeben wurde, geben wir die direkt
				# entsprechend zugreifbaren Object-IDs, zusammen mit den dafür
				# verantwortlichen Zugriffs-IDs zurück 
				result = []
				for i, row in enumerate(c):
					if not limit:
						result.append( row )
					elif i<limit:
						result.append( row )
					else:
						break
				return result
			test_mask = None
			for row in c:
				if test_mask == None:
					test_mask = row[2]
				else:
					test_mask &= row[2]
			if test_mask!=None and test_mask & access_mask:
				return True
		return False
	
	def grant_read( self, object_id ):
		self.grant_access( object_id, "read" )
	def grant_write( self, object_id ):
		self.grant_access( object_id, "write" )
	def grant_access( self, object_id, access_type ):
		if access_type not in ("read", "write"):
			raise NotImplementedError( "Unsupported access_type" )
		access_mask = self.ACCESS_MASKS[ access_type ]
		c = self.app.db.cursor()
		c.execute( """select * from permissions where subject_id=? and object_id=?""", [self.id, object_id] )
		if c.fetchone()!=None:
			c.execute( """update permissions set access_mask=(access_mask|%(access_mask)d) where subject_id=? and object_id=?""" \
							% locals(), [self.id, object_id] )
			self.app.db.commit()
		else:
			c.execute( """insert into permissions (subject_id, object_id, access_mask) values (?,?,%(access_mask)d)""" \
							% locals(), [self.id, object_id] )
			self.app.db.commit()

def get_anonymous_user( app ):
	c = app.db.cursor()
	c.execute( "select object_id from users where nick='anonymous'" )
	result = c.fetchone()
	if result:
		return User(app, user_id=result[0])
	else:
		return None
