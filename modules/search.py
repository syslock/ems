import imp, re, json
from lib import db_object
db_object = imp.reload( db_object )
from modules import get
get = imp.reload( get )

def process( app ):
	q = app.query
	if "phrase" in q.parms:
		search_phrase = q.parms["phrase"]
		search( app, search_phrase )
	elif "apropos" in q.parms:
		prefix = q.parms["apropos"]
		apropos( app, prefix )

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

def search( app, search_phrase ):
	q = app.query
	words = [ word.lower() for word in re.split(r'[^a-zA-Z0-9äöüßÄÖÜ%:\-+]',search_phrase) if word ]
	valid_types = q.parms["types"].split(",") if "types" in q.parms else []
	raw_results = {}
	c = app.db.cursor()
	for i, word in enumerate(words):
		# optionales Wichtungs-Präfix aus '-' und '+' parsen, wobei ein positiveres Präfix Treffer des Suchwortes
		# höher bewertet und ein negativeres Präfix Treffer der Ausschlussmenge des Suchwortes höher bewertet:
		weight_prefix = re.findall( "^([-+]*)", word )[0]
		word_weight = sum( [(lambda x: 10 if x=='+' else -10)(c) for c in weight_prefix] )
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
		for row in c:
			object_id, result_word, pos, scan_source, object_type = row
			hit = {
				"object_id" : object_id,
				"result_word" : result_word,
				"pos" : pos,
				"scan_source" : scan_source,
				"object_type" : object_type,
				"search_word" : word,
				"weight" : word_weight
			}
			if object_id in raw_results:
				raw_results[object_id].append( hit )
			else:
				raw_results[object_id] = [ hit ]
	word_hits = {} # hiermit zählen wir Treffer pro Suchwort im gefilterten Endergebnis
	for search_word in words:
		word_hits[search_word] = 0
	# 1.) Wir machen eine Zugriffsprüfung, filtern die Trefferliste entsprechend und 
	#     erweitern die Trefferliste ggf. um Eltern- und Kindobjekte mit passendem Typ, sodass z.b.
	#     Blog-Einträge für auf die Volltextsuche passende plain/text-Objekte oder Beiträge
	#     von passenden Nutzernamen gefunden werden:
	filtered_results = {}
	for result_id in raw_results:
		for hit in raw_results[result_id]:
			object_id = hit["object_id"]
			search_word = hit["search_word"]
			if app.user.can_read( object_id ):
				if object_type in valid_types or not valid_types:
					if object_id in filtered_results:
						filtered_results[object_id].append( hit )
					else:
						filtered_results[object_id] = [ hit ]
					word_hits[search_word] += 1
				else:
					obj = db_object.DBObject( app, object_id )
					matching_associates = obj.resolve_parents( parent_type_set=valid_types ) + obj.resolve_children( child_type_set=valid_types )
					for alt_obj_id in matching_associates:
						if app.user.can_read( alt_obj_id ):
							hit["related_object_id"] = alt_obj_id
							if alt_obj_id in filtered_results:
								filtered_results[alt_obj_id].append( hit )
							else:
								filtered_results[alt_obj_id] = [ hit ]
							word_hits[search_word] += 1
	# 2.) Treffer sinnvoll sortieren, wobei:
	# - Anzahl treffender Suchbegriffe verstärkend wirken: len(filtered_results[x])
	# - Gesamtzahl der Treffer aller treffenden Suchbegriffe abschwächend wirken: /sum(...)
	# TODO: Testen ob das hilfreiche Trefferlisten ergibt und optimale Wichtung finden
	sort_key = lambda x: (1+sum([h["weight"] for h in filtered_results[x]])) * len(filtered_results[x]) / max(1,sum([word_hits[sw] for sw in set([h["search_word"] for h in filtered_results[x]])]))
	hit_ids = sorted( filtered_results, key=sort_key, reverse=True )
	sort_keys = sorted( [sort_key(x) for x in filtered_results], reverse=True )
	result = {
		"hit_ids" : hit_ids,
		"reasons" : {},
		"sort_keys" : sort_keys,
		"hitlist" : get.get( app, object_ids=hit_ids, recursive=[True,True] )
	}
	
	for hit_id in hit_ids:
		result["reasons"][hit_id] = filtered_results[hit_id]
	app.response.output += json.dumps( result )

def apropos( app, prefix ):
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
	app.response.output += json.dumps( result )
