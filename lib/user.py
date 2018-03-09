import sqlite3, time, re, socket
from lib import password
from lib import errors
from lib import db_object
from lib import files

class User( db_object.DBObject ):
	media_type = "application/x-obj.user"
	def __init__( self, app, user_id=None, nick=None, plain_password=None, 
					email=None, parent_id=None ):
		if( user_id!=None ):
			super().__init__( app, object_id=user_id )
		else:
			self.check( app, nick, plain_password, email )
			super().__init__( app, media_type=self.media_type, parent_id=parent_id )
			encrypted_password = password.encrypt( plain_password )
			try:
				c = self.app.db.cursor()
				c.execute( """insert into users (object_id,nick,password,email)
								values (?,?,?,?)""",
							[self.id, nick, encrypted_password, email] )
				self.app.db.commit()
				self.index( data=nick, source="nick", rank=2 )
			except sqlite3.IntegrityError as e:
				raise Exception( "Nick already in use" )
	
	def flat_copy( self, new_parent_id ):
		raise NotImplementedError()
	
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
		super().update( **keyargs )
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
			if self.app.user.id==self.id:
				# normal users have to authorize the change with their old password
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
			if self.app.user.can_read( avatar_id ):
				obj = db_object.DBObject( self.app, object_id=avatar_id )
				if files.File.supports(self.app, obj.media_type) and obj.media_type.startswith("image/"):
					file_obj = files.File( self.app, object_id=obj.id )
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
	
	def can_read( self, object_id=None, limit=None ):
		return self.can_access( object_id, "read", limit=limit )
	
	def can_write( self, object_id=None, limit=None ):
		return self.can_access( object_id, "write", limit=limit )
	
	def can_delete( self, object_id, limit=None ):
		"""Ein Objekt ist löschbar, wenn es selbst und alle Eltern schreibbar sind."""
		c = self.app.db.cursor()
		c.execute( """select parent_id from membership where child_id=? -- can_delete""",
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
		access_key = (self.id, object_id, access_type)
		if access_key not in self.app.access_cache:
			self.app.access_cache[ access_key ] = self._can_access( object_id, access_type, limit )
			self.app.trace( "can_access: "+str(access_key)+" "+str(self.app.access_cache[access_key]) )
			self.app.trace( "access_cache size: "+str(len(self.app.access_cache)) )
		return self.app.access_cache[ access_key ]
	
	def _can_access( self, object_id, access_type, limit=None ):
		if access_type not in self.ACCESS_MASKS:
			raise NotImplementedError( "Unsupported access_type" )
		access_mask = self.ACCESS_MASKS[ access_type ]
		c = self.app.db.cursor()
		next_subject_zone = next_subject_childs = { self.id }.union( set(map(int,self.app.session.parms["subject_id"].split(",")) if "subject_id" in self.app.session.parms else []) )
		next_object_zone = next_object_childs = object_id and { object_id } or set()
		if len(next_object_zone):
			# Wir erweitern die Suchzonen solange, bis wir eine Entscheidung, oder
			# keine Kindobjekte für eine weitere Elternsuche mehr haben:
			while len(next_subject_childs) or len(next_object_childs):
				# Subjektklausel aus der aktuellen Subjektzone generieren:
				current_subject_zone = next_subject_zone
				subject_constraint = "subject_id in %s" % str(tuple(current_subject_zone)).replace(",)",")")
				# Objektklausel aus der aktuellen Objektzone generieren:
				current_object_zone = next_object_zone
				object_constraint = "object_id in %s" % str(tuple(current_object_zone)).replace(",)",")")
				# Regelsuche in den aktuellen Suchzonen:
				c.execute( """select subject_id, object_id, access_mask
								from permissions
								inner join objects on permissions.object_id=objects.id
								where %(subject_constraint)s and %(object_constraint)s
								order by objects.mtime desc""" \
							% locals() )
				for row in c:
					if (row[2] & access_mask)==0:
						# Explizite Verbote in der aktuellen Suchzone setzen sich
						# gegen ältere, gleichrangige und nachrangige Erlaubnisse durch:
						# TODO: Zugriffs-Caches der betroffenen Kindobjekte aktualisieren?
						self.app.trace( "_can_access: %d--(%d)->%d [denied]" % (row[0], row[2], row[1]) )
						return False
					if (row[2] & access_mask)!=0:
						# Explizite Erlaubnisse in der aktuellen Suchzone setzen sich
						# gegen ältere, gleichrangige und nachrangige Verbote durch:
						# TODO: Zugriffs-Caches der betroffenen Kindobjekte aktualisieren?
						self.app.trace( "_can_access: %d--(%d)->%d [permitted]" % (row[0], row[2], row[1]) )
						return True
				# Eltern-Gruppen(!), der aktuellen Erweiterungsgruppe, bilden die nächste Erweiterungsgruppe
				self.app.trace( "current_subject_childs: "+str(next_subject_childs) )
				next_subject_childs = self.closest_parents( next_subject_childs, parent_type="application/x-obj.group" )
				self.app.trace( "next_subject_childs: "+str(next_subject_childs) )
				# Nächste Subjektzone ist aktuelle Subjektzone + Eltern derselben:
				next_subject_zone = current_subject_zone.union( next_subject_childs )
				# Eltern, der aktuellen Erweiterungsgruppe, bilden die nächste Erweiterungsgruppe
				self.app.trace( "current_object_childs: "+str(next_object_childs) )
				next_object_childs = self.closest_parents( next_object_childs )
				self.app.trace( "next_object_childs: "+str(next_object_childs) )
				# Nächste Objektzone ist aktuelle Objektzone + Eltern derselben:
				next_object_zone = current_object_zone.union( next_object_childs )
			# Wenn wir in der globalen Zone keine Erlaubnis haben, ist es verboten:
			# TODO: Um Überlast durch Fehlzugriffe in großen Datenbanken zu vermeiden, sollten 
			#       wir einen Weg finden explizite Verbote zu behandeln und diese Cachen!
			return False
		else:
			# Falls keine object_id übergeben wurde, geben wir die direkt
			# entsprechend zugreifbaren Object-IDs, zusammen mit den dafür
			# verantwortlichen Zugriffs-IDs zurück:
			# TODO: wieder mit dem rekursiven Algorithmus oben zusammenbauen, sodass wir im
			#       Idealfall eine Liste aller zugreifbaren Objekte aus dem Cache bekommen!
			subject_constraint = "subject_id in %s" % str(tuple(next_subject_zone)).replace(",)",")")
			c.execute( """select subject_id, object_id, access_mask
							from permissions
							inner join objects on permissions.object_id=objects.id
							where %(subject_constraint)s and (access_mask & %(access_mask)d)>0
							order by objects.mtime desc""" \
						% locals() )
			result = []
			for i, row in enumerate(c):
				if not limit:
					result.append( row )
				elif i<limit:
					result.append( row )
				else:
					break
			return result
		return False
db_object.DBObject.register_class( User )


class SpecialUser( User ):
	def __init__( self, app, nick ):
		self.app = app
		c = app.db.cursor()
		c.execute( "select object_id from users where nick=?", [nick] )
		result = c.fetchone()
		if result:
			self.id=result[0]
		else:
			raise errors.StateError( "Cannot find special user '%s'!" % (nick) )
		self.post_init( self.id, None, User.media_type, 0 )

def get_anonymous_user( app ):
	return SpecialUser( app, 'anonymous' )
def get_admin_user( app ):
	return SpecialUser( app, 'admin' )
