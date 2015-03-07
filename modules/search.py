import imp, re, json
from lib import db_object
db_object = imp.reload( db_object )
from lib import errors
errors = imp.reload( errors )
from modules import get
get = imp.reload( get )

def process( app ):
	q = app.query
	result_types = q.parms["result_types"].split(",") if "result_types" in q.parms else []
	range_offset = int(q.parms["range_offset"]) if "range_offset" in q.parms else 0
	range_limit = q.parms["range_limit"] if "range_limit" in q.parms else None
	range_limit = None if str(range_limit).lower()=="none" else int(range_limit)
	if "phrase" in q.parms:
		search_phrase = q.parms["phrase"]
		min_weight = q.parms["min_weight"] if "min_weight" in q.parms else 0
		if str(min_weight).lower()=="none":
			min_weight = None
		else:
			min_weight = int(min_weight)
		order_by = q.parms["order_by"] if "order_by" in q.parms else None
		order_reverse = q.parms["order_reverse"].lower()=="true" if "order_reverse" in q.parms else True
		search( app, search_phrase, result_types=result_types, min_weight=min_weight, 
				order_by=order_by, order_reverse=order_reverse, 
				range_offset=range_offset, range_limit=range_limit )
	elif "apropos" in q.parms:
		prefix = q.parms["apropos"]
		apropos( app, prefix, result_types=result_types, range_offset=range_offset, range_limit=range_limit )

search_type_alias = {
#(schon durch text-source)	"text" : "text/plain",
	"video" : "video/%",
	"audio" : "audio/%",
	"image" : "image/%",
	"entry" : "application/x-obj.entry",
	"minion" : "application/x-obj.minion",
	"publication" : "application/x-obj.publication",
	"tag" : "application/x-obj.tag",
	"user" : "application/x-obj.user",
	"group" : "application/x-obj.group",
	"jpg" : "image/jpeg",
	"png" : "image/png",
	"svg" : "image/svg+xml",
	"html" : "text/html",
	"mp4" : "video/mp4",
	"webm" : "video/webm",
}

def search( app, search_phrase, result_types=[], min_weight=0, order_by=None, order_reverse=True, range_offset=0, range_limit=None ):
	q = app.query
	
	# 1.) Suchausdruck parsen und Datenstrukturen initialisieren:
	words = [ word.lower() for word in re.split(r'[ \t\r\n]',search_phrase) if word ]
	raw_results = {}
	c = app.db.cursor()
	search_words = [w for w in words]
	search_word_rows = {}
	
	# 2.) Einzelne Suchbegriffe mit optionaler Typbindung im Wortindex nachschlagen und 
	#     getroffene Objekt-Ids mit der Suchbegriffwichtung verknüpft zwischenspeichern:
	for i, search_word in enumerate(search_words):
		word = search_word
		# optionales Wichtungs-Präfix aus '-' und '+' parsen, wobei ein positiveres Präfix Treffer des Suchwortes
		# höher bewertet und ein negativeres Präfix Treffer der Ausschlussmenge des Suchwortes höher bewertet:
		weight_prefix = re.findall( "^([-+]*)", word )[0]
		word_weight = sum( [(lambda x: 10 if x=='+' else -10)(c) for c in weight_prefix] ) + (10 if not weight_prefix else 0)
		word = word[len(weight_prefix):]
		# optionalen Typ-Selektor der Form <[typ1:[typ2:[...]]]wort> parsen:
		parts = word.split(":")
		word_types = parts[:-1]
		word = parts[-1]
		words[i] = word # Wort für spätere Trefferbewertung ohne Type-Präfix abspeichern
		type_query = ""
		type_names = []
		for j, word_type in enumerate(word_types):
			if j:
				type_query += " or "
			if word_type in search_type_alias:
				type_query += "o.type like ?"
				type_names.append( search_type_alias[word_type] )
			else:
				type_query += "scan_source=?"
				type_names.append( word_type )
		if type_query:
			type_query = "and (" + type_query + ")"
		c.execute( """select object_id, word, pos, scan_source, o.type from keywords 
						inner join objects o on o.id=object_id
						where word like ? %(type_query)s order by object_id, pos""" % locals(), [word]+type_names )
		search_word_rows[ search_word ] = 0
		for row in c:
			search_word_rows[ search_word ] += 1
			object_id, result_word, pos, scan_source, object_type = row
			hit = {
				"object_id" : object_id,
				"result_word" : result_word,
				"pos" : pos,
				"scan_source" : scan_source,
				"object_type" : object_type,
				"search_word" : search_word,
				"keyword" : word,
				"weight" : word_weight,
				"extra_reasons" : { "valid_types" : [], "associated_to" : [] }
			}
			if object_id in raw_results:
				raw_results[object_id].append( hit )
			else:
				raw_results[object_id] = [ hit ]
	search_word_hits = {} # hiermit zählen wir Treffer pro Suchwort im gefilterten Endergebnis
	for search_word in search_words:
		search_word_hits[search_word] = 0
	
	# 3.) Wir machen eine Zugriffsprüfung, filtern die Trefferliste entsprechend und 
	#     erweitern die Trefferliste ggf. um Eltern- und Kindobjekte mit passendem Typ, sodass z.b.
	#     Blog-Einträge für auf die Volltextsuche passende plain/text-Objekte oder Beiträge
	#     von passenden Nutzernamen gefunden werden:
	filtered_results = {}
	for result_id in raw_results:
		for hit in raw_results[result_id]:
			object_id = hit["object_id"]
			object_type = hit["object_type"]
			search_word = hit["search_word"]
			if app.user.can_read( object_id ):
				if object_type in result_types or not result_types:
					hit["extra_reasons"]["valid_types"].append( object_type )
					if object_id in filtered_results:
						filtered_results[object_id].append( hit )
					else:
						filtered_results[object_id] = [ hit ]
					search_word_hits[search_word] += 1
				else:
					obj = db_object.DBObject( app, object_id )
					matching_associates = obj.resolve_parents( parent_type_set=result_types ) + obj.resolve_children( child_type_set=result_types )
					for alt_obj_id in matching_associates:
						if app.user.can_read( alt_obj_id ):
							hit["extra_reasons"]["associated_to"].append( alt_obj_id )
							if alt_obj_id in filtered_results:
								filtered_results[alt_obj_id].append( hit )
							else:
								filtered_results[alt_obj_id] = [ hit ]
							search_word_hits[search_word] += 1
	
	# 4.) Treffer sinnvoll sortieren, wobei:
	# - Anzahl treffender Suchbegriffe verstärkend wirken: len(filtered_results[x])
	# - Gesamtzahl der Treffer aller treffenden Suchbegriffe abschwächend wirken: /sum(...)
	sort_key = lambda x: (1+sum([h["weight"] for h in filtered_results[x]])) * len(filtered_results[x]) / max(1,sum([search_word_hits[sw] for sw in set([h["search_word"] for h in filtered_results[x]])]))
	hit_weights = [(hit_id,sort_key(hit_id)) for hit_id in filtered_results]
	hit_weights = sorted( hit_weights, key=lambda x: x[1], reverse=True )
	
	# 5.) Treffer nach Minimalgewicht filtern, falls definiert:
	hit_weights = [x for x in hit_weights if min_weight==None or x[1]>min_weight]
	hit_id_list = [x[0] for x in hit_weights]
	
	# 6.) Möglichst effiziente SQL-Sortierung durchführen, falls gewünscht:
	if order_by in ("id","ctime","mtime"):
		order_dir = "desc" if order_reverse else "asc"
		hit_id_list_string = ",".join( [str(x) for x in hit_id_list] )
		c.execute( """select id, ctime, mtime from objects where id in (%(hit_id_list_string)s) order by %(order_by)s %(order_dir)s""" % locals() )
		hit_id_list = [row[0] for row in c]
	
	# 7.) Vorsortierte Objekt-ID-Liste beschneiden, falls gefordert:
	hit_id_list = hit_id_list[range_offset:None if range_limit==None else range_offset+range_limit]
	
	# 8.) Rekursiver Lookup von Eltern- und Kind-Objekten der reduzierten Trefferliste:
	hitlist = []
	if hit_id_list:
		hitlist = get.get( app, object_ids=hit_id_list, recursive=[True,True], access_errors=False )
	
	# 9.) Ergebnis JSON-kodieren:
	result = {
		"hit_weights" : hit_weights,
		"reasons" : {},
		"hitlist" : hitlist,
		"search_word_rows" : search_word_rows,
		"search_word_hits" : search_word_hits,
	}
	for hit_id,hit_weight in hit_weights:
		result["reasons"][hit_id] = filtered_results[hit_id]
	app.response.output = json.dumps( result )

def apropos( app, prefix, result_types, range_offset=0, range_limit=None ):
	q = app.query
	c = app.db.cursor()
	word_counts = {}
	pattern = prefix+"%"
	c.execute( """select object_id, word, rank from keywords 
					where word like ?""", [pattern] )
	for row in c:
		obj_id, word, rank = row
		if app.user.can_read( obj_id ):
			if word not in word_counts:
				word_counts[word] = { "count":0, "rank":0 }
			counter = word_counts[word]
			counter["count"]+=1
			counter["rank"]+=rank
			
	result = sorted( word_counts.items(), key=(lambda x: x[0]) )
	app.response.output += json.dumps( result[range_offset:None if range_limit==None else range_offset+range_limit] )
