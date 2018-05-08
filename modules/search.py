import re, json, datetime
from lib import db_object
from lib import errors
from lib import files
from modules import get

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
		children = q.parms["children"].lower()=="true" if "children" in q.parms else False
		parents = q.parms["parents"].lower()=="true" if "parents" in q.parms else False
		if "recursive" in q.parms:
			children = parents = q.parms["recursive"].lower()=="true"
		max_phrase_word_dist = int(q.parms["max_phrase_word_dist"]) if "max_phrase_word_dist" in q.parms else 3
		exact_includes = q.parms["exact_includes"].lower()=="true" if "exact_includes" in q.parms else True
		exact_excludes = q.parms["exact_excludes"].lower()=="true" if "exact_excludes" in q.parms else True
		search( app, search_phrase, result_types=result_types, min_weight=min_weight, 
				order_by=order_by, order_reverse=order_reverse, 
				range_offset=range_offset, range_limit=range_limit,
				recursive=(parents,children), max_phrase_word_dist=max_phrase_word_dist,
				exact_includes=exact_includes, exact_excludes=exact_excludes )
	elif "apropos" in q.parms:
		prefix = q.parms["apropos"]
		apropos( app, prefix, result_types=result_types, range_offset=range_offset, range_limit=range_limit )

search_type_alias = {
#(schon durch text-source)	"text" : "text/plain",
	"video" : "video/%",
	"audio" : "audio/%",
	"image" : "image/%",
	"entry" : "application/x-obj.entry",
	"draft" : "application/x-obj.draft",
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

time_types = { "ctime", "mtime" }

def search( app, search_phrase, result_types=[], min_weight=0, order_by=None, order_reverse=True, range_offset=0, 
		   range_limit=None, recursive=(False,False), max_phrase_word_dist=3, exact_includes=True, exact_excludes=True ):
	q = app.query
	
	# 1.) Suchausdruck parsen und Datenstrukturen initialisieren:
	phrase_parts = []
	current_word = ""
	in_phrase = False
	phrase_start_char = None
	for i,c in enumerate( search_phrase ):
		if c in " \t\r\n" and not in_phrase:
			if current_word:
				phrase_parts.append( current_word )
				current_word = ""
		elif c in ['"',"'"] and not in_phrase:
			in_phrase=True
			phrase_start_char = c
			current_word += c
		elif in_phrase and c==phrase_start_char:
			in_phrase=False
			phrase_start_char = None
			current_word += c
		else:
			current_word += c
	if current_word:
		phrase_parts.append( current_word )
			
	search_words = []
	for part in phrase_parts:
		match = re.fullmatch( "([?]?)([+-]*)((?:[\w]+:)*)(.+)", part, re.DOTALL )
		optional = match.group(1)=="?"
		weight_prefix = match.group(2)
		word_weight = sum( [(lambda x: 10 if x=='+' else -10)(c) for c in weight_prefix] ) + (10 if weight_prefix=="" else 0)
		_word = match.group(4)
		phrase_match = re.fullmatch( '([?]?)"([^"]*)"?(?:\[([0-9]+)\])?', _word )
		if not phrase_match:
			phrase_match = re.fullmatch( "([?]?)'([^']*)'?(?:\[([0-9]+)\])?", _word )
		if phrase_match:
			_word = None
			_phrase = phrase_match.group(2)
			try:
				_phrase_max_word_dist = int(phrase_match.group(3))
			except TypeError:
				_phrase_max_word_dist = max_phrase_word_dist
		else:
			_phrase = None
			_phrase_max_word_dist = max_phrase_word_dist
		word = {
			"optional" : optional,
			"weight" : word_weight,
			"type" : match.group(3),
			"word" : _word,
			"phrase" : _phrase,
			"phrase_max_word_dist" : _phrase_max_word_dist,
			"raw_word" : part
		}
		search_words.append( word )
	raw_results = {}
	c = app.db.cursor()
	search_word_rows = {}
	search_word_hits = {} # hiermit zählen wir Treffer pro Suchwort im gefilterten Endergebnis
	
	# 2.) Einzelne Suchbegriffe mit optionaler Typbindung im Wortindex nachschlagen und 
	#     getroffene Objekt-Ids mit der Suchbegriffwichtung verknüpft zwischenspeichern:
	for i, search_word in enumerate(search_words):
		# optionales Wichtungs-Präfix aus '-' und '+' parsen, wobei ein positiveres Präfix Treffer des Suchwortes
		# höher bewertet und ein negativeres Präfix Treffer der Ausschlussmenge des Suchwortes höher bewertet:
		word_weight = search_word["weight"]
		# optionalen Typ-Selektor der Form <[typ1:[typ2:[...]]]wort> parsen:
		word_types = search_word["type"].split(":")[:-1]
		type_query = ""
		type_names = []
		time_col = None
		for j, word_type in enumerate(word_types):
			if word_type in search_type_alias:
				if len(type_names):
					type_query += " or "
				type_query += "o.type like ?"
				type_names.append( search_type_alias[word_type] )
			elif word_type in time_types:
				time_col = word_type
			else:
				if len(type_names):
					type_query += " or "
				type_query += "k0.scan_source=?"
				type_names.append( word_type )
		if type_query:
			type_query = "and (" + type_query + ")"
		search_word_rows[ search_word["raw_word"] ] = 0
		search_word_hits[ search_word["raw_word"] ] = 0
		if time_col:
			# time queries have the form ctime:201707 ("created some time in july 2017") or mtime:<2017 ("last modified before 2017")
			time_query_string = search_word["word"] if search_word["word"] else search_word["phrase"]
			# lib.application replaces some xml control characters with entities, we have to fix that now:
			time_query_string = time_query_string.replace("&amp;","&").replace("&gt;",">").replace("&lt;","<")
			time_query_string = re.sub( "[-:. ]","", time_query_string ) # eg: 2017-07-23 15:38 -> 201707231538
			match = re.fullmatch( r"(<|>|<=|>=|=)?([0-9]+)", time_query_string )
			if not match:
				raise errors.ParameterError( "Illegal time query, try something like ctime:2017-01" )
			time_op = match.group(1) or "="
			time_string = match.group(2)
			attr_list = ["year"]
			if len(time_string)>=6:
				attr_list.append( "month" )
			if len(time_string)>=8:
				attr_list.append( "day" )
			if len(time_string)>=10:
				attr_list.append( "hour" )
			if len(time_string)>=12:
				attr_list.append( "minute" )
			if len(time_string)>=14:
				attr_list.append( "second" )
			time_pattern_dict = { "year":"%Y", "month":"%m", "day":"%d", "hour":"%H", "minute":"%M", "second":"%S" }
			# generate time parse pattern, eg.: %Y%m%d
			time_pattern = "".join( [time_pattern_dict[x] for x in attr_list] )
			time_range_begin = datetime.datetime.strptime( time_string, time_pattern )
			time_range_after = None
			if time_op == "=":
				# for time range equality comparisons we need to determine the end of the range:
				while not time_range_after:
					try:
						# try to generate the first date not matching the time string (but 20171232 or 201713 would be illegal...)
						last_attr = attr_list.pop()
						ref_time = datetime.datetime.strptime( time_string, time_pattern )
						time_range_after = ref_time.replace( **{last_attr:getattr(time_range_begin,last_attr)+1} )
					except ValueError:
						# for illegal cases try again one level higher, eg: 20171232 -> 201713 -> 2018
						time_string = time_string[:-2]
						time_pattern = time_pattern[:-2]
				c.execute( """select object_id, o.%(time_col)s, pos, scan_source, o.type from keywords k0
								inner join objects o on o.id=object_id
								where %(time_col)s>=? and %(time_col)s<? %(type_query)s order by object_id, pos""" % locals(), 
							[time_range_begin.timestamp(), time_range_after.timestamp()] + type_names )
			else:
				c.execute( """select object_id, o.%(time_col)s, pos, scan_source, o.type from keywords k0
								inner join objects o on o.id=object_id
								where %(time_col)s %(time_op)s ? %(type_query)s order by object_id, pos""" % locals(), 
							[time_range_begin.timestamp()] + type_names )
		elif search_word["word"]:
			word = search_word["word"]
			c.execute( """select object_id, word, pos, scan_source, o.type from keywords k0
							inner join objects o on o.id=object_id
							where word like ? %(type_query)s order by object_id, pos""" % locals(), [word]+type_names )
		elif search_word["phrase"]:
			phrase = search_word["phrase"]
			phrase_max_word_dist = search_word["phrase_max_word_dist"]
			phrase_words = phrase.split()
			phrase_joins = []
			phrase_queries = []
			result_phrase_field_string = ""
			for i,phrase_word in enumerate(phrase_words):
				if i>0:
					prev_i = i-1
					phrase_joins.append( """
						inner join keywords k%(i)d 
							on k0.object_id=k%(i)d.object_id 
							and k0.scan_source=k%(i)d.scan_source 
							and abs(k%(i)d.pos-k%(prev_i)d.pos)<=%(phrase_max_word_dist)d""" % locals() )
					phrase_queries.append( "and k%(i)d.word like ?" % locals() )
					result_phrase_field_string += "||' '||k%(i)d.word" % locals()
				else:
					phrase_queries.append( "k%(i)d.word like ?" % locals() )
					result_phrase_field_string += "k%(i)d.word" % locals()
			s_phrase_joins = "\n".join( phrase_joins )
			s_phrase_queries = "\n".join( phrase_queries )
			c.execute( """select k0.object_id, %(result_phrase_field_string)s, k0.pos, k0.scan_source, o.type from keywords k0 
							inner join objects o on o.id=k0.object_id
							%(s_phrase_joins)s
							where %(s_phrase_queries)s %(type_query)s order by k0.object_id, k0.pos""" % locals(), phrase_words+type_names )
		for row in c:
			search_word_rows[ search_word["raw_word"] ] += 1
			object_id, result_word, pos, scan_source, object_type = row
			if not type(word_weight)==int:
				raise errors.StateError(type(word_weight))
			if type(search_word["word"]) not in (str,type(None)):
				raise errors.StateError(type(search_word["word"]))
			if type(result_word) not in (str,int):
				raise errors.StateError(type(result_word))
			if not type(pos)==int:
				raise errors.StateError(type(pos))
			if not type(scan_source)==str:
				raise errors.StateError(type(scan_source))
			if not type(search_word["raw_word"])==str:
				raise errors.StateError(type(search_word["raw_word"]))
			hit = {
				"object_id" : object_id,
				"object_type" : object_type,
				"reasons" : { (
					object_id, #"object_id"
					word_weight, #"weight"
					search_word["word"], #"keyword"
					result_word, #"result_word"
					scan_source, #"scan_source"
					search_word["raw_word"], #"raw_word"
				) },
				"associated_to" : set()
			}
			if object_id in raw_results:
				raw_results[object_id]["reasons"] = raw_results[object_id]["reasons"].union( hit["reasons"] )
			else:
				raw_results[object_id] = hit
	
	# 3.) Wir machen eine Zugriffsprüfung, filtern die Trefferliste entsprechend und 
	#     erweitern die Trefferliste ggf. um Eltern- und Kindobjekte mit passendem Typ, sodass z.b.
	#     Blog-Einträge für auf die Volltextsuche passende plain/text-Objekte oder Beiträge
	#     von passenden Nutzernamen gefunden werden:
	filtered_results = {}
	for object_id in raw_results:
		hit = raw_results[ object_id ]
		object_type = hit["object_type"]
		if app.user.can_read( object_id ):
			direct_hit = False
			if object_type in result_types or "file" in result_types and files.File.supports(app, object_type) or not result_types:
				c = app.db.cursor()
				# Hier müssen wir zunächst prüfen ob das gefundene Objekt ein Substitute-Objekt ist, denn 
				# Substitute-Objekte sollten nicht als Treffer zurück geliefert werden.
				c.execute( """select original_id from substitutes where substitute_id=?""", [object_id] )
				if c.fetchone()==None:
					direct_hit = True
					if object_id not in filtered_results:
						filtered_results[object_id] = hit
					else:
						# Merge existing results reason set:
						# this is not going to happen as long as we iterate over raw_results and that is a dictionary, but who knows...
						filtered_results[object_id]["reasons"] = filtered_results[object_id]["reasons"].union( hit["reasons"] )
					for reason in hit["reasons"]:
						object_id, weight, keyword, result_word, scan_source, raw_word = reason
						search_word_hits[ raw_word ] += 1
			if not direct_hit:
				obj = db_object.DBObject( app, object_id )
				matching_associates = obj.resolve_parents( parent_type_set=set(result_types) ) + obj.resolve_children( child_type_set=set(result_types) )
				for alt_obj_id in matching_associates:
					if app.user.can_read( alt_obj_id ):
						c = app.db.cursor()
						# Hier müssen wir zunächst prüfen ob das gefundene Objekt ein Substitute-Objekt ist, denn 
						# Substitute-Objekte sollten nicht als Treffer zurück geliefert werden.
						c.execute( """select original_id from substitutes where substitute_id=?""", [alt_obj_id] )
						if c.fetchone()==None:
							hit["associated_to"].add( object_id )
							if alt_obj_id not in filtered_results:
								filtered_results[alt_obj_id] = hit
							else:
								# Merge existing results reason set:
								filtered_results[alt_obj_id]["reasons"] = filtered_results[alt_obj_id]["reasons"].union( hit["reasons"] )
							for reason in hit["reasons"]:
								object_id, weight, keyword, result_word, scan_source, raw_word = reason
								search_word_hits[ raw_word ] += 1
	
	# 4.) Treffer sortieren
	if order_by=="weight" or min_weight!=None or exact_includes or exact_excludes:
		# a) Relevanzsortierung/Relevanzfilterung, wobei die:
		# - gewichtete Anzahl treffender Suchbegriffe verstärkend wirkt: weighted_reason_sum
		# - Gesamtzahl der Treffer aller treffenden Suchbegriffe abschwächend wirken: search_word_hit_sum
		def sort_key( object_id ):
			hit = filtered_results[ object_id ]
			weighted_reason_sum = 0
			search_word_hit_sum = 0
			all_positive_terms_found = True
			no_negative_terms_found = True
			for reason in hit["reasons"]:
				object_id, weight, keyword, result_word, scan_source, raw_word = reason
				weighted_reason_sum += 1*weight
				search_word_hit_sum += search_word_hits[ raw_word ]
				no_negative_terms_found = no_negative_terms_found and weight>=0
			if exact_includes:
				for search_word in search_words:
					if not search_word["optional"] and search_word["weight"]>=0:
						positive_term_found = False
						for reason in hit["reasons"]:
							object_id, weight, keyword, result_word, scan_source, raw_word = reason
							if search_word["raw_word"]==raw_word:
								positive_term_found = True
								break
						all_positive_terms_found = all_positive_terms_found and positive_term_found
						if all_positive_terms_found==False:
							break
			hit_weight = weighted_reason_sum / (1+search_word_hit_sum)
			return (hit_weight, all_positive_terms_found, no_negative_terms_found)
		hit_weights = [(hit_id,sort_key(hit_id)) for hit_id in filtered_results]
		if order_by=="weight":
			hit_weights = sorted( hit_weights, key=lambda x: x[1], reverse=order_reverse )
		# b) Exclude hits, if below min_weight, when defined:
		if min_weight!=None:
			hit_weights = [x for x in hit_weights if x[1][0]>min_weight]
		# c) Exclude hits not matching all positive search terms if required
		if exact_includes:
			hit_weights = [x for x in hit_weights if x[1][1]==True]
		# d) Exclude hits matching at least one negative search term if required
		if exact_excludes:
			hit_weights = [x for x in hit_weights if x[1][2]==True]
	else:
		hit_weights = [(hit_id,0) for hit_id in filtered_results]
	hit_id_list = [x[0] for x in hit_weights]
	if order_by in ("id","ctime","mtime"):
		# c) Möglichst effiziente SQL-Sortierung nach Zeitstempel durchführen, falls gewünscht:
		order_dir = "desc" if order_reverse else "asc"
		hit_id_list_string = ",".join( [str(x) for x in hit_id_list] )
		c.execute( """select id, ctime, mtime from objects where id in (%(hit_id_list_string)s) order by %(order_by)s %(order_dir)s""" % locals() )
		hit_id_list = [row[0] for row in c]
	
	# 7.) Vorsortierte Objekt-ID-Liste beschneiden, falls gefordert:
	hit_id_list = hit_id_list[range_offset:None if range_limit==None else range_offset+range_limit]
	
	# 8.) Ggf. rekursiver Lookup von Eltern- und Kind-Objekten der reduzierten Trefferliste:
	hitlist = []
	if hit_id_list:
		hitlist = get.get( app, object_ids=hit_id_list, recursive=recursive, access_errors=False )
	for hit in hitlist:
		hit["reasons"] = list( filtered_results[hit["id"]]["reasons"] )
		#hit["associated_to"] = get.get( app, object_ids=list(filtered_results[hit["id"]]["associated_to"]), recursive=(False,False), access_errors=False )
		hit["weight"] = [x[1] for x in hit_weights if x[0]==hit["id"]][0]
	
	# 9.) Ergebnis JSON-kodieren:
	result = {
		"hitlist" : hitlist,
		"search_word_rows" : search_word_rows,
		"search_word_hits" : search_word_hits,
	}
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
