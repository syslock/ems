from lib import errors
from lib import db_object


class Entry( db_object.DBObject ):
	media_type = "application/x-obj.entry"
	def __init__( self, app, **keyargs ):
		keyargs["media_type"] = self.media_type
		super().__init__( app, **keyargs )
		
	def create_draft( self ):
		c = self.app.db.cursor()
		c.execute( """select c.id from membership 
						inner join objects c on c.id=child_id 
						where parent_id=? and c.type='application/x-obj.draft'""", [self.id] )
		for row in c:
			raise NotImplementedError( "Tried to create more than one draft for an entry" )
		reference_types = [ 'application/x-obj.tag', 'application/x-obj.publication' ]
		draft = self.flat_copy( new_parent_id=self.id, include=self.select(type=reference_types) )
		draft.update( media_type='application/x-obj.draft' )
		for orig_child_id in self.select( not_type=reference_types+['application/x-obj.draft'] ):
			orig_child = db_object.DBObject.create_typed_object( app=self.app, object_id=orig_child_id )
			draft_child = orig_child.flat_copy( new_parent_id=draft.id )
		draft = Draft( app=self.app, object_id=draft.id )
		# Also directly attach the draft object to the user and copy creation time from entry:
		draft.update( parent_id=self.app.user.id, ctime=self.ctime )
		return draft
db_object.DBObject.register_class( Entry )


class Draft( Entry ):
	media_type = "application/x-obj.draft"
	def __init__( self, app, **keyargs ):
		super().__init__( app, **keyargs )
	
	def publish( self ):
		if not self.app.user.can_write( self.id ) or not self.app.user.can_write( self.app.user.id ):
			raise errors.PrivilegeError( "Cannot publish entry without write permission to entry and user object" )
		# First check if Draft is already a child of the user object
		c = self.app.db.cursor()
		c.execute( """select parent_id from membership
						where child_id=? and parent_id=?""", [self.id,self.app.user.id] )
		result = c.fetchone()
		if not result:
			# Add the draft as a child of the user object if not already the case:
			c.execute( """insert into membership (parent_id,child_id) values(?,?)""", [self.app.user.id, self.id] )
		# Remove the draft from any associated entry, is it will become independent now:
		c.execute( """select p.id from membership
						inner join objects p on p.id=parent_id
						where child_id=? and p.type='application/x-obj.entry'""", [self.id] )
		for row in c:
			if not self.app.user.can_write( row[0] ):
				raise errors.PrivilegeError( "Cannot remove draft status from draft associated with an entry the user cannot write" )
			c.execute( """delete from membership where parent_id=? and child_id=?""", [row[0], self.id] )
		# Finally change the type from draft to entry:
		self.update( media_type='application/x-obj.entry' )
		# ... and update creation time to the modification time so the newly 
		# published entry does not have the initial creation time of the draft:
		self.update( ctime=self.mtime )
		return self.id
		
	def merge_to_parent( self ):
		if not self.app.user.can_write( self.id ):
			raise errors.PrivilegeError( "Cannot write the draft to be merged" )
		c = self.app.db.cursor()
		c.execute( """select p.id from membership
						inner join objects p on p.id=parent_id
						where child_id=? and p.type='application/x-obj.entry'""", [self.id] )
		result = c.fetchone()
		if not result:
			raise errors.ObjectError( "Cannot merge draft without parent entry" )
		parent_id = result[0]
		if not self.app.user.can_write( parent_id ):
			raise errors.PrivilegeError( "Cannot write parent entry to merge into" )
		# backup drafts title
		c.execute( """select data from titles where object_id=?""", [self.id] )
		result = c.fetchone()
		if result:
			draft_title = result[0]
		else:
			draft_title = None
		# replace old childs of main entry object with childs of the draft object:
		cleanup_ids = set()
		c.execute( """select child_id from membership where parent_id=? and child_id!=?""", [parent_id, self.id] )
		for row in c:
			cleanup_ids.add( row[0] )
		db_object.DBObject.delete_in( self.app, object_id_list=list(cleanup_ids), parent_id=parent_id )
		c.execute( """select child_id,sequence from membership where parent_id=?""", [self.id] )
		for row in c:
			c2 = self.app.db.cursor()
			c2.execute( """insert into membership (parent_id, child_id, sequence) values (?,?,?)""", [parent_id,row[0],row[1]] )
		db_object.DBObject.delete_in( self.app, object_id_list=[self.id] )
		parent_entry = Entry( app=self.app, object_id=parent_id )
		# save possibly changed title, ctime and update parent entries mtime:
		parent_entry.update( title=draft_title, ctime=self.ctime )
		return parent_id
db_object.DBObject.register_class( Draft )
