import imp, re, subprocess, os, json
from lib import user
user = imp.reload( user )
from lib import errors
errors = imp.reload( errors )
from lib import db_object
db_object = imp.reload( db_object )
from lib import files
files = imp.reload( files )
# FIXME: Objektbeschreibungsfunktion nach DBObject ausmodularisieren:
from modules import get as get_module
get_module = imp.reload( get_module )

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	source_id = int( query.parms["id"] )
	mode = query.parms["mode"] if "mode" in query.parms else "convert"
	if app.user.can_read( source_id ):
		source_obj = files.File( app, object_id=source_id )
		if re.match( r"^video/.*", source_obj.media_type ):
			new_poster_offset = float(query.parms["poster_offset"]) if "poster_offset" in query.parms else None
			new_poster_id = int(query.parms["poster_id"]) if "poster_id" in query.parms else None
			if new_poster_id and app.user.can_write( source_id ) and app.user.can_read( new_poster_id ):
				new_poster_obj = files.File( app, object_id=new_poster_id )
			else:
				new_poster_obj = None
			# zur Bestimmung der Größen und Bitraten der Alternativobjekte identifizieren wir zunächst das Orignalobjekt:
			source_size = source_obj.get_size()
			source_meta = source_obj.identify()
			source_width = int( source_meta["mplayer"]["id"]["video"]["width"] )
			source_rate = round(source_size*8/float(source_meta["mplayer"]["id"]["length"])/1000)
			results = []
			class ConversionDescription:
				def __init__( self, role, width, media_type, rate=0, condition=lambda x: True ):
					self.role = role
					self.width = width
					self.media_type = media_type
					self.rate = rate
					self.condition = condition
				def applies( self ):
					return self.condition(self)
				def __eq__( self, other ):
					# rate is not part of equality, because this is used to compare conversion candidates with already existing substitutes 
					# and bitrate is deemed to specific for that purpose; we just assume rates are ok/equal for a given size
					return (	(self.role, self.width, self.media_type, self.applies()) ==
								(other.role, other.width, other.media_type, other.applies()) )
				def __str__( self ):
					return( "(role=%s, width=%dpx, media_type=%s, rate=%dk, applies=%s)" % (self.role, self.width, self.media_type, self.rate, str(self.applies())) )
			# we want a poster image, an mp4-substitute in source_width for non-mp4 sources and a scaled down mp4-substitute for big sources:
			missing_conversions = [
				ConversionDescription( role="poster", width=min(1280, source_width), media_type="image/jpeg" ),
				ConversionDescription( role="compatible", width=source_width, media_type="video/mp4", rate=source_rate,
						  condition = lambda self:  source_obj.media_type != "video/mp4" ),
				ConversionDescription( role="compatible", width=min(1280, source_width), media_type="video/mp4", rate=min(2000, source_rate),
						  condition = lambda self: (self.width < (source_width*0.8)) and (self.rate < (source_rate*0.8)) ),
			]
			c = app.db.cursor()
			# Hier müssen wir zunächst prüfen ob das angefragte Objekt selbst schon ein Substitute-Objekt ist, ...
			c.execute( """select original_id from substitutes where substitute_id=?""", [source_obj.id] )
			if c.fetchone():
				# ... denn für Substitute-Objekte sollten keine weiteren Substitute-Objekte generiert werden.
				missing_conversions = []
			c.execute( """select s.substitute_id, s.type, s.size, s.priority, sobj.id from substitutes s
							left join objects sobj on sobj.id=s.substitute_id
							where s.original_id=?""", [source_obj.id] )
			for row in c:
				substitute = { "substitute_id" : int(row[0]), "type" : row[1], "size" : int(row[2]), "priority" : int(row[3]) }
				sobj_id = row[4]
				if sobj_id==None:
					# Zombie-Substitutes bereinigen (FIXME: sollte das von DBObject.delete() erledigt werden?):
					del_c = app.db.cursor()
					del_c.execute( """delete from substitutes where substitute_id=?""", [substitute["substitute_id"]] )
					app.db.commit()
				else:
					substitute_obj = db_object.DBObject( app, object_id=substitute["substitute_id"] )
					conversion = ConversionDescription( role=substitute["type"], width=substitute["size"], media_type=substitute_obj.media_type )
					if conversion in missing_conversions:
						if substitute["type"]=="poster" and (new_poster_offset or new_poster_obj):
							# bestehendes Poster-Substitute entfernen, da es neu definiete werden soll:
							del_c = app.db.cursor()
							del_c.execute( """delete from substitutes where original_id=? and substitute_id=?""", [source_obj.id,substitute_obj.id] )
							app.db.commit()
						else:
							missing_conversions.remove( conversion )
							results.append( substitute )
					else:
						results.append( substitute )
			error_list = []
			if mode == "convert":
				# Alle fehlende Objekte sofort ohne Daten anlegen, um Mehrfachkonvertierung zu vermeiden:
				new_objects = []
				for conversion in [x for x in missing_conversions if x.applies()]:
					# Privilege-Escalation damit nicht nur der Eigentümer des Target-Objekts diesen Code ausführen kann:
					app_old_user = app.user
					app.user = user.get_admin_user(app)
					existing_object_id = None
					if conversion.role=="poster" and new_poster_obj:
						existing_object_id = new_poster_obj.id
					new_obj = files.File( app, object_id=existing_object_id, parent_id=source_obj.id, media_type=conversion.media_type )
					if not existing_object_id:
						new_obj.conversion = conversion;
						new_objects.append( new_obj )
					substitute = { "substitute_id" : new_obj.id, "type" : conversion.role, "size" : conversion.width, "priority" : None }
					results.append( substitute )
					app.user = app_old_user
					c = app.db.cursor()
					c.execute( """insert into substitutes (original_id, substitute_id, type, size) values(?,?,?,?)""", 
														[source_obj.id, new_obj.id, conversion.role, conversion.width] )
					app.db.commit()
				# Konvertierungsvorgänge für angelegte Objekte durchführen:
				for new_obj in new_objects:
					base_type, sub_type = new_obj.media_type.split("/")
					new_tmp_name = new_obj.storage_path+".tmp."+sub_type
					if( re.match(r"^video/.*", new_obj.media_type) ):
						# Konvertierung mit geänderter Breite bei Erhaltug des Seitenverhältnisses:
						# http://stackoverflow.com/questions/8218363/maintaining-ffmpeg-aspect-ratio
						p = subprocess.Popen( ["ffmpeg", "-y", "-i", source_obj.storage_path, "-vf", "scale=%d:trunc(ow/a/2)*2" % (new_obj.conversion.width), 
													"-r", "25", "-b", "%dk" % new_obj.conversion.rate, "-qmin", "0", "-strict", "-2", new_tmp_name],
												stdout=subprocess.PIPE, stderr=subprocess.PIPE )
					elif( new_obj.conversion.role=="poster" and new_obj.media_type == "image/jpeg" ):
						# Vorschaubild bei Zeitindex 3s extrahieren:
						p = subprocess.Popen( ["ffmpeg", "-y", "-i", source_obj.storage_path, "-vf", "scale=%d:trunc(ow/a/2)*2" % (new_obj.conversion.width), 
													"-ss", str(new_poster_offset if new_poster_offset else 3), "-vframes", "1", new_tmp_name],
												stdout=subprocess.PIPE, stderr=subprocess.PIPE )
					else:
						raise NotImplementedError( "missing operation for conversion: %s" % (str(new_obj.conversion)) )
					stdout, stderr = p.communicate()
					if p.returncode!=0:
						try:
							# FIXME: Löschenfunktion nach DBObject ausmodularisieren und Dateibereinigung nach files.File:
							# Privilege-Escalation damit nicht nur der Eigentümer des Target-Objekts diesen Code ausführen kann:
							app_old_user = app.user
							app.user = user.get_admin_user(app)
							db_object.DBObject.delete_in( app, [new_obj.id] )
							app.user = app_old_user
							os.remove( new_tmp_name )
							c = app.db.cursor()
							c.execute( """delete from substitutes where original_id=? and substitute_id=?""", [source_obj.id, new_obj.id] )
							app.db.commit()
							results = [x for x in results if x["substitute_id"]!=new_obj.id]
						except Exception as e:
							error_list.append( e )
						errmsg = stderr.decode().split("\n")[-1]
						error_list.append( errors.InternalProgramError(errmsg) )
					else:
						os.rename( new_tmp_name, new_obj.storage_path )
			# Fehlerbehandlung:
			if error_list:
				msg = ""
				for error in error_list:
					if msg:
						msg += "; "
					msg += str(error)
				raise errors.InternalProgramError( msg )
			else:
				for result in results:
					result["substitute_object"] = get_module.get(app, object_ids=[result["substitute_id"]])
				response.output = json.dumps( {"succeeded": True,
										"substitutes": results} )
		elif re.match( r"^audio/.*", source_obj.media_type ):
			raise NotImplementedError( "unsupported media type: "+source_obj.media_type )
		else:
			raise NotImplementedError( "unsupported media type: "+source_obj.media_type )
	else:
		raise errors.PrivilegeError()
