import imp, re, subprocess, os, json
from lib import user
user = imp.reload( user )
from lib import errors
errors = imp.reload( errors )
from lib import db_object
db_object = imp.reload( db_object )
# FIXME: Löschenfunktion nach DBObject ausmodularisieren:
from modules import delete as delete_module
delete_module = imp.reload( delete_module )
# FIXME: Objektbeschreibungsfunktion nach DBObject ausmodularisieren:
from modules import get as get_module
get_module = imp.reload( get_module )

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	target_id = int( query.parms["id"] )
	mode = query.parms["mode"] if "mode" in query.parms else "convert"
	if app.user.can_read( target_id ):
		target_obj = db_object.File( app, object_id=target_id )
		if re.match( r"^video/.*", target_obj.media_type ):
			new_poster_offset = float(query.parms["poster_offset"]) if "poster_offset" in query.parms else None
			new_poster_id = int(query.parms["poster_id"]) if "poster_id" in query.parms else None
			if new_poster_id and app.user.can_write( target_id ) and app.user.can_read( new_poster_id ):
				new_poster_obj = db_object.File( app, object_id=new_poster_id )
			else:
				new_poster_obj = None
			# Wir brauchen min. webm (Firefox, Chrome) und mp4 (Safari, IE, Chrome) für eine halbwegs gute
			# Client-Abdeckung.
			# Direkte Kindobjekte danach durchsuchen:
			results = []
			missing_conversions = [
				("poster",480,"image/jpeg"),
				("compatible",480,"video/mp4"),
				("compatible",480,"video/webm"),
			]
			c = app.db.cursor()
			# Hier müssen wir zunächst prüfen ob das angefragte Objekt selbst schon ein Substitute-Objekt ist, ...
			c.execute( """select original_id from substitutes where substitute_id=?""", [target_obj.id] )
			if c.fetchone():
				# ... denn für Substitute-Objekte sollten keine weiteren Substitute-Objekte generiert werden.
				missing_conversions = []
			c.execute( """select s.substitute_id, s.type, s.size, s.priority, sobj.id from substitutes s
							left join objects sobj on sobj.id=s.substitute_id
							where s.original_id=?""", [target_obj.id] )
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
					conversion = (substitute["type"], substitute["size"], substitute_obj.media_type)
					if conversion in missing_conversions:
						if substitute["type"]=="poster" and (new_poster_offset or new_poster_obj):
							# bestehendes Poster-Substitute entfernen, da es neu definieter werden soll:
							del_c = app.db.cursor()
							del_c.execute( """delete from substitutes where original_id=? and substitute_id=?""", [target_obj.id,substitute_obj.id] )
							app.db.commit()
						else:
							missing_conversions.remove( conversion )
							results.append( substitute )
			error_list = []
			if mode == "convert":
				# Alle fehlende Objekte sofort ohne Daten anlegen, um Mehrfachkonvertierung zu vermeiden:
				new_objects = []
				for conversion in missing_conversions:
					conversion_type, conversion_size, new_media_type = conversion
					# Privilege-Escalation damit nicht nur der Eigentümer des Target-Objekts diesen Code ausführen kann:
					app_old_user = app.user
					app.user = user.get_admin_user(app)
					existing_object_id = None
					if conversion_type=="poster" and new_poster_obj:
						existing_object_id = new_poster_obj.id
					new_obj = db_object.File( app, object_id=existing_object_id, parent_id=target_obj.id, media_type=new_media_type )
					if not existing_object_id:
						new_obj.conversion = conversion;
						new_objects.append( new_obj )
					substitute = { "substitute_id" : new_obj.id, "type" : conversion_type, "size" : conversion_size, "priority" : None }
					results.append( substitute )
					app.user = app_old_user
					c = app.db.cursor()
					c.execute( """insert into substitutes (original_id, substitute_id, type, size) values(?,?,?,?)""", 
														[target_obj.id, new_obj.id, conversion_type, conversion_size] )
					app.db.commit()
				# Konvertierungsvorgänge für angelegte Objekte durchführen:
				for new_obj in new_objects:
					conversion_type, conversion_size, ignored = new_obj.conversion
					base_type, sub_type = new_obj.media_type.split("/")
					new_tmp_name = new_obj.storage_path+".tmp."+sub_type
					if( re.match(r"^video/.*", new_obj.media_type) ):
						# Konvertierung mit konservativer Breite von 480px bei Erhaltug des Seitenverhältnisses:
						# http://stackoverflow.com/questions/8218363/maintaining-ffmpeg-aspect-ratio
						p = subprocess.Popen( ["ffmpeg", "-y", "-i", target_obj.storage_path, "-vf", "scale=%d:trunc(ow/a/2)*2" % (conversion_size), 
													"-r", "25", "-b", "1000k", "-qmin", "0", "-strict", "-2", new_tmp_name],
												stdout=subprocess.PIPE, stderr=subprocess.PIPE )
					elif( conversion_type=="poster" and new_obj.media_type == "image/jpeg" ):
						# Vorschaubild bei Zeitindex 3s extrahieren (TODO: Mit beliebigem Zeitindex einstellbar machen?):
						p = subprocess.Popen( ["ffmpeg", "-y", "-i", target_obj.storage_path, "-vf", "scale=%d:trunc(ow/a/2)*2" % (conversion_size), 
													"-ss", str(new_poster_offset if new_poster_offset else 3), "-vframes", "1", new_tmp_name],
												stdout=subprocess.PIPE, stderr=subprocess.PIPE )
					else:
						raise NotImplementedError( "missing operation for conversion: "+str(new_obj.conversion) )
					stdout, stderr = p.communicate()
					if p.returncode!=0:
						try:
							# FIXME: Löschenfunktion nach DBObject ausmodularisieren und Dateibereinigung nach db_object.File:
							# Privilege-Escalation damit nicht nur der Eigentümer des Target-Objekts diesen Code ausführen kann:
							app_old_user = app.user
							app.user = user.get_admin_user(app)
							delete_module.delete_in( app, [new_obj.id] )
							app.user = app_old_user
							os.remove( new_tmp_name )
							c = app.db.cursor()
							c.execute( """delete from substitutes where original_id=? and substitute_id=?""", [target_obj.id, new_obj.id] )
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
		elif re.match( r"^audio/.*", target_obj.media_type ):
			raise NotImplementedError( "unsupported media type: "+target_obj.media_type )
		else:
			raise NotImplementedError( "unsupported media type: "+target_obj.media_type )
	else:
		raise errors.PrivilegeError()
