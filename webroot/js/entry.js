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

function new_entry( object_id_or_title )
{
	var object_id = undefined
	var title = undefined
	if( String(Number(object_id_or_title))!=String(NaN) )
	{
		object_id = Number(object_id_or_title)
	}
	else if( object_id_or_title!=undefined )
	{
		title = object_id_or_title;
	}
	if( object_id==undefined )
	{
		// Neuen Eintrag auf dem Server anlegen:
		var url = "ems.wsgi?do=store&type=application/x-obj.entry";
		if( title )
		{
			// Titel kann, muss aber nicht vordefiniert werden
			url += "&title="+title
		}
		$.ajax({
			url : url,
			async : false,
			success :
		function( result )
		{
			result = parse_result( result )
			if( result.succeeded && result.object_id!=undefined )
			{
				// Neuen Eintrag im Browser anlegen:
				var entry_id = result.object_id
				var entry = new_entry( entry_id )
				var button = $(".entry-edit",entry)[0]
				edit_entry( button )
			}
		}})
		return undefined;
	}
	else
	{
		var entry = $("#ems-entry-template").first().clone(true)[0];
		entry.id = "ems-entry-"+String(object_id)
		entry.style.display = ""
		$(".ems-entry").first().before( entry )
		entry.data = {
			"object_id" : object_id,
		}
		return entry;
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
				show_object( result[i] )
			}
		}})
	}
}

function show_object( obj, dom_parent )
{
	if( obj.type == "application/x-obj.group" )
	{
		for( i in obj.children )
		{
			show_object( obj.children[i] )
		}
	}
	if( obj.type == "application/x-obj.user" )
	{
		for( i in obj.children )
		{
			show_object( obj.children[i] )
		}
	}
	if( obj.type == "application/x-obj.entry" )
	{
		var entry = $("ems-entry-"+String(obj.id))[0]
		if( !entry )
		{
			entry = new_entry( obj.id )
		}
		var entry_title = $(".entry-title",entry)[0]
		if( obj.title )
		{
			entry_title.innerHTML = obj.title
		}
		for( i in obj.children )
		{
			show_object( obj.children[i], entry )
		}
	}
	if( obj.type == "text/plain" )
	{
		var entry_content = $(".entry-content",dom_parent)[0]
		var div = $("#entry-text-template").first().clone()[0]
		div.id = "entry-text-"+String(obj.id)
		div.style.display = ""
		div.innerHTML = obj.data
		entry_content.appendChild( div );
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

