function new_text_part( entry_id, data )
{
	// neuese Textsegment auf Server und im Browser anlegen:
	var div = $("#entry-text-template").first().clone()[0]
	$.ajax({
		url : "ems.wsgi?do=store&type=text/plain&data="+data+"&parent_id="+String(entry_id),
		async : false,
		success :
	function( result )
	{
		result = parse_result( result )
		if( result.succeeded && result.object_id!=undefined )
		{
			div.id = "entry-text-"+String(result.object_id)
			div.style.display = ""
			div.innerHTML = data
		}
		else
		{
			div = undefined
		}
	}})
	return div
}

function get_short_type( type ) {
	return type.match(/.*\.([^.]*)/)[1]
}
function new_item( parms )
{
	var short_type = get_short_type( parms.type )
	if( parms.id==undefined )
	{
		// Neues Objekt auf dem Server anlegen:
		var url = "ems.wsgi?do=store&type="+parms.type;
		// optionale Zusatzparameter:
		if( parms.title ) url += "&title="+parms.title
		if( parms.nick ) url += "&nick="+parms.nick
		if( parms.name ) url += "&name="+parms.name
		$.ajax({
			url : url,
			async : false,
			success :
		function( result )
		{
			result = parse_result( result )
			if( result.succeeded && result.object_id!=undefined )
			{
				// Neues Element im Browser anlegen:
				var item_id = result.object_id
				parms.id = item_id
				var item = new_item( parms )
				var button = $("."+short_type+"-edit",item)[0]
				if( button ) edit_entry( button )
			}
		}})
		return undefined;
	}
	else
	{
		var item = $("#ems-"+short_type+"-"+String(parms.id))[0]
		if( !item )
		{
			item = $("#ems-"+short_type+"-template").first().clone(true)[0];
			item.id = "ems-"+short_type+"-"+String(parms.id)
			item.style.display = ""
			$(parms.dom_parent).first().prepend( item )
			item.data = {
				"object_id" : parms.id,
			}
		}
		var field_name = undefined
		if( parms.title ) field_name = "title";
		if( parms.nick ) field_name = "nick";
		if( parms.name ) field_name = "name";
		if( field_name )
		{
			var item_field = $( "."+short_type+"-"+field_name, item )[0]
			if( item_field ) item_field.innerHTML = parms[ field_name ]
		}
		return item;
	}
}

function load_visible_objects( session )
{
	if( session )
	{
		$.ajax({
			url : "ems.wsgi?do=get&view=all&recursive=true",
			async : false,
			success :
		function( result )
		{
			result = parse_result( result )
			for( i in result )
			{
				show_object( result[i], $(".ems-content")[0] )
			}
		}})
	}
}

function show_object( obj, dom_parent )
{
	if( obj.type == "application/x-obj.group" )
	{
		var item = new_item( {type:obj.type, id:obj.id, name:obj.name, dom_parent:dom_parent} )
		for( var i in obj.children )
		{
			show_object( obj.children[i], $("."+get_short_type(obj.type)+"-content",item)[0] )
		}
	}
	if( obj.type == "application/x-obj.user" )
	{
		var item = new_item( {type:obj.type, id:obj.id, nick:obj.nick, dom_parent:dom_parent} )
		for( var i in obj.children )
		{
			show_object( obj.children[i], $("."+get_short_type(obj.type)+"-content",item)[0] )
		}
	}
	if( obj.type == "application/x-obj.entry" )
	{
		var item = new_item( {type:obj.type, id:obj.id, title:obj.title, dom_parent:dom_parent} )
		for( var i in obj.children )
		{
			show_object( obj.children[i], $("."+get_short_type(obj.type)+"-content",item)[0] )
		}
	}
	if( obj.type == "text/plain" )
	{
		var div = $( "#entry-text-"+String(obj.id) )[0]
		if( !div )
		{
			div = $("#entry-text-template").first().clone()[0]
			div.id = "entry-text-"+String(obj.id)
			dom_parent.appendChild( div );
		}
		div.style.display = ""
		div.innerHTML = obj.data
	}
}

function edit_entry( button )
{
	var title = $(".entry-title",button.parentNode)[0]
	if( !title ) return;
	var content = $(".entry-content",button.parentNode)[0]
	if( !content ) return;
	title.contentEditable = true
	content.contentEditable = true
	if( title.innerHTML.length==0 ) title.focus()
	else content.focus()
	button.innerHTML = LS("20120513161628","Speichern")
	button.onclick = function(){ save_entry(button) }
}

function save_entry( button )
{
	var entry_id = Number( button.parentNode.id.split("-").reverse()[0] )
	var title = $(".entry-title",button.parentNode)[0]
	if( !title ) return;
	var content = $(".entry-content",button.parentNode)[0]
	if( !content ) return;
	title.contentEditable = false
	content.contentEditable = false
	// 1.) Strukturnormalisierung:
	var remove_list = []
	// 1.a) Titel:
	for( var i=0; i<title.childNodes.length; i++ )
	{
		var child = title.childNodes[i]
		if( child.nodeName!="#text" )
		{
			remove_list.push( child )
		}
	}
	// 2.b) Inhalt:
	for( var i=0; i<content.childNodes.length; i++ )
	{
		var child = content.childNodes[i]
		if( child.nodeName=="#text" )
		{
			var data = child.nodeValue
			new_div = new_text_part(entry_id, data)
			if( new_div==undefined ) return;
			$(child).before( new_div )
			$(child).remove()
		}
		else if( child.className=="entry-text" )
		{
			var extract_siblings = [];
			for( var k=0; k<child.childNodes.length; k++ )
			{
				var sub = child.childNodes[k]
				if( sub.nodeName!="#text" || extract_siblings.length>0 )
				{
					extract_siblings.push(sub);
				}
			}
			extract_siblings.reverse()
			for( k in extract_siblings )
			{
				var sub = extract_siblings[k]
				$(sub).detach()
				$(child).after( sub )
			}
		}
		else
		{
			remove_list.push( child )
		}
	}
	for( var i in remove_list )
	{
		$(remove_list[i]).remove()
	}
	// 2.) Speicherung und Sortierung:
	// 2.a) Titel:
	$.ajax({
		url : "ems.wsgi?do=store&id="+String(entry_id)
			+"&title="+title.innerHTML,
		async : false,
		success :
	function( result )
	{
		result = parse_result( result )
	}})
	// 2.b) Inhalt:
	var part_id_list = []
	for( var i=0; i<content.childNodes.length; i++ )
	{
		var child = content.childNodes[i]
		if( child.className=="entry-text" )
		{
			var part_id = Number( child.id.split("-").reverse()[0] )
			part_id_list.push( part_id )
			// FIXME: data muss vorkodiert werden!
			$.ajax({
				url : "ems.wsgi?do=store&id="+String(part_id)
					+"&sequence="+String(10+i*10)
					+"&data="+child.innerHTML,
				async : false,
				success :
			function( result )
			{
				result = parse_result( result )
			}})
		}
	}
	// 3.) serverseitige Bereinigung der entfernten Elemente:
	$.ajax({
		url : "ems.wsgi?do=delete&parent_id="+String(entry_id)
			+"&child_not_in="+part_id_list.join(","),
		async : false,
		success :
	function( result )
	{
		result = parse_result( result )
	}})
	button.innerHTML = LS("20120513162048","Bearbeiten")
	button.onclick = function(){ edit_entry(button) }
}

