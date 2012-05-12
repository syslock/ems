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
			div.id = "entry-text-"+String(entry_id)+"-"+String(result.object_id)
			div.style.display = ""
			div.innerHTML = data
		}
	}})
	return div
}

function new_entry( object_id )
{
	if( object_id==undefined )
	{
		// Neuen Eintrag auf dem Server anlegen:
		$.ajax({
			url : "ems.wsgi?do=store&type=application/x-obj.entry",
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

function load_entries( session )
{
	if( session )
	{
		$.get("ems.wsgi?do=get&id="+session.login.id+"&view=meta",
		function( result )
		{
			result = parse_result( result )
			for( i in result.children )
			{
				var entry_id = result.children[i]
				$.ajax({
					url : "ems.wsgi?do=get&id="+entry_id+"&view=meta",
					async : false,
					success :
				function( result )
				{
					result = parse_result( result )
					if( result.type == "application/x-obj.entry" )
					{
						var entry = $("ems-entry-"+String(result.id))[0]
						if( !entry )
						{
							entry = new_entry( result.id )
						}
						var entry_heading = $(".entry-heading",entry)[0]
						if( result.title )
						{
							entry_heading.innerHTML = result.title
						}
						var entry_content = $(".entry-content",entry)[0]
						for( j in result.children )
						{
							var part_id = result.children[j]
							$.ajax({
								url : "ems.wsgi?do=get&id="+part_id+"&view=meta",
								async : false,
								success :
							function( result )
							{
								result = parse_result( result )
								if( result.type == "text/plain" )
								{
									$.ajax({
										url : "ems.wsgi?do=get&id="+result.id,
										async : false,
										success :
									function( result )
									{
										var div = $("#entry-text-template").first().clone()[0]
										div.id = "entry-text-"+String(entry_id)+"-"+String(part_id)
										div.style.display = ""
										div.innerHTML = result
										entry_content.appendChild( div );
									}})
								}
							}})
						}
					}
				}})
			}
		})
	}
}

function edit_entry( button )
{
	var content = $(".entry-content",button.parentNode)[0]
	if( !content ) return;
	content.contentEditable = true
	content.focus()
	button.innerHTML = "Speichern"
	button.onclick = function(){ save_entry(button) }
}

function save_entry( button )
{
	var entry_id = Number( button.parentNode.id.split("-").reverse()[0] )
	var content = $(".entry-content",button.parentNode)[0]
	if( !content ) return;
	content.contentEditable = false
	// 1.) Strukturnormalisierung:
	for( var i=0; i<content.childNodes.length; i++ )
	{
		var child = content.childNodes[i]
		if( child.nodeName=="#text" )
		{
			var data = child.nodeValue
			$(child).before( new_text_part(entry_id, data) )
			$(child).remove()
		}
		if( child.tagName=="br" )
		{
			$(child).remove()
		}
		if( child.className=="entry-text" )
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
	}
	// 2.) Speicherung und Sortierung:
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
	button.innerHTML = "Bearbeiten"
	button.onclick = function(){ edit_entry(button) }
}
