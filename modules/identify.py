import imp, re, subprocess, os
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

def populate_dict( dict, path, value, delim="." ):
	key_parts = path.split(delim)
	prev_node = None
	curr_node = dict
	for key_part in key_parts:
		if key_part not in curr_node:
			new_node = {}
			curr_node[ key_part ] = new_node
			prev_node = curr_node
			curr_node = new_node
		else:
			prev_node = curr_node
			curr_node = curr_node[ key_part ]
	prev_node[ key_part ] = value

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	target_ids = [int(x) for x in query.parms["id"].split(",")]
	object_list = get_module.get( app, object_ids=target_ids )
	metainfo_list = []
	for target_id in target_ids:
		if app.user.can_read( target_id ):
			target_obj = db_object.File( app, object_id=target_id )
			if re.match( r"^video/.*", target_obj.media_type ) or re.match( r"^audio/.*", target_obj.media_type ):
				mplayer_id = {}
				p = subprocess.Popen( ["mplayer", "-identify", "-frames" , "0", "-ao", "null", "-vo", "null", 
										target_obj.storage_path],
										stdout=subprocess.PIPE, stderr=subprocess.PIPE )
				stdout, stderr = p.communicate()
				if p.returncode!=0:
					errmsg = stderr.decode()
					raise errors.InternalProgramError( errmsg )
				else:
					for line in stdout.decode().split("\n"):
						if line.startswith("ID_") and not line.startswith("ID_FILENAME"):
							parts = line.split("=")
							key = parts[0].lower()
							value = "=".join(parts[1:])
							populate_dict( mplayer_id, key, value, delim="_" )
					metainfo_list.append( {"id" : target_id, "mplayer" : mplayer_id} )
			elif re.match( r"^image/.*", target_obj.media_type ):
				exiv2_data = { "summary" : {} }
				image_info = {} # Substruktur für dauerhaft verfügbare Metadaten (z.b. width, height)
				p = subprocess.Popen( ["exiv2", target_obj.storage_path],
										stdout=subprocess.PIPE, stderr=subprocess.PIPE )
				stdout, stderr = p.communicate()
				if p.returncode not in (0, 253):
					errmsg = stderr.decode()
					raise errors.InternalProgramError( errmsg )
				else:
					for line in stdout.decode().split("\n"):
						result = re.findall( "([^:]+):(.*)", line )
						try:
							key, value = result[0]
						except IndexError:
							continue
						key = key.strip().replace(" ","_")
						if( key in ["File_name"] ):
							continue
						value = value.strip()
						exiv2_data[ "summary" ][ key ] = value
						if( key=="Image_size" ):
							x, y = value.split("x")
							x=int(x.strip())
							y=int(y.strip())
							image_info["width"] = x #.image.width
							image_info["height"] = y #.image.height
				p = subprocess.Popen( ["exiv2", "-pa", target_obj.storage_path],
										stdout=subprocess.PIPE, stderr=subprocess.PIPE )
				stdout, stderr = p.communicate()
				if p.returncode not in (0, 253):
					errmsg = stderr.decode()
					raise errors.InternalProgramError( errmsg )
				else:
					for line in stdout.decode().split("\n"):
						result = re.findall( "([^ ]+)[ ]+([^ ]+)[ ]+([^ ]+)[ ]+([^ ].*)", line )
						try:
							key, type, count, value = result[0]
						except IndexError:
							continue
						populate_dict( exiv2_data, key, value )
				metainfo_list.append( {"id" : target_id, "exiv2":exiv2_data, "image":image_info} )
			else:
				raise NotImplementedError( "unsupported media type: "+target_obj.media_type )
		else:
			raise errors.PrivilegeError()
	for metainfo in metainfo_list:
		for obj in object_list:
			if obj["id"] == metainfo["id"]:
				obj.update( metainfo )
	response.output = str( {"succeeded" : True, "objects" : object_list} )
