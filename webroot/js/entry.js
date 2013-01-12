function new_text_part( entry_id, data )
{
	// neuese Textsegment auf Server und im Browser anlegen:
	var div = $("#entry-text-template").first().clone()[0]
	$.ajax({
		url : "ems.wsgi?do=store&type=text/plain&parent_id="+String(entry_id),
		type : "POST",
		data : { data : data },
		async : false,
		success :
	function( result )
	{
		result = parse_result( result )
		if( result.succeeded && result.object_id!=undefined )
		{
			div.id = "entry-text-"+String(result.object_id)
			div.style.display = ""
			$(div).html( data )
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
function new_item( parms ) {
	if( !parms.obj ) {
		show_error( "new_item ohne Objektdefinition" )
		return;
	}
	var obj = parms.obj;
	if( !obj.type ) {
		show_error( "new_item ohne Objekt-Typ-Definition" )
		return;
	}
	var short_type = get_short_type( obj.type )
	if( obj.id==undefined ) {
		// Neues Objekt auf dem Server anlegen:
		var url = "ems.wsgi?do=store&type="+obj.type;
		// optionale Zusatzparameter:
		if( obj.title ) url += "&title="+obj.title
		if( obj.nick ) url += "&nick="+obj.nick
		if( obj.name ) url += "&name="+obj.name
		$.ajax({
			url : url,
			async : false,
			success :
		function( result ) {
			result = parse_result( result )
			if( result.succeeded && result.object_id!=undefined ) {
				obj.id = result.object_id
				if( !parms.dom_object ) {
					// Neues Element im Browser anlegen:
					var item = new_item( parms )
					var button = $("."+short_type+"-edit",item)[0]
					if( button ) edit_entry( button )
				}
				else {
					parms.dom_object.data = {
						"object_id" : obj.id,
					}
				}
			}
		}})
		return undefined;
	} else {
		var item = parms.dom_object;
		if( !item && parms.update ) {
			if( parms.dom_parent ) {
				item = $(".ems-"+short_type, parms.dom_parent)[0]
			} else if( parms.dom_child ) {
				item = $(parms.dom_child).closest(".ems-"+short_type)[0]
			}
		}
		if( !item && !parms.duplicates ) {
			item = $("#ems-"+short_type+"-"+String(obj.id))[0]
		}
		if( !item ) {
			item = $("#ems-"+short_type+"-template").first().clone(true)[0];
			item.id = "ems-"+short_type+"-"+String(obj.id)
			item.style.display = ""
			if( parms.dom_parent ) {
				if( parms.prepend ) {
					$(parms.dom_parent).first().prepend( item );
				} else {
					$(parms.dom_parent).first().append( item );
				}
				// Im DOM eingehängte Objekte kapseln wir auf der obersten Ebene mit .ems-item
				$(item).wrap( '<span class="ems-item"></span>' );
			} else if( parms.dom_child ) {
				$(parms.dom_child).first().before( item );
				$("."+short_type+"-content",item).append( parms.dom_child );
			}
			item.data = {
				"object_id" : obj.id,
			}
		}
		for( field_name in {"title":1, "nick":1, "name":1, "ctime":1, "mtime":1} ) {
			var value = obj[ field_name ];
			if( field_name in {"ctime":1, "mtime":1} ) {
				var date = new Date(value*1000);
				var day = date.getDate()+"."+(date.getMonth()+1)+"."+date.getFullYear()
				var hours = date.getHours();
				hours = (hours<10) ? "0"+String(hours) : String(hours);
				var minutes = date.getMinutes();
				minutes = (minutes<10) ? "0"+String(minutes) : String(minutes);
				var time = hours+":"+minutes;
				$( "."+short_type+"-"+field_name+"-day", item ).first().text( day );
				$( "."+short_type+"-"+field_name+"-time", item ).first().text( time );
			} else {
				$( "."+short_type+"-"+field_name, item ).first().text( value )
			}
		}
		for( permission in {"read":1,"write":1,"delete":1,"insert":1} ) {
			if( $.inArray(permission, obj.permissions)==-1 ) {
				$( ".require-permission-"+permission+"-"+short_type, item ).each( function(i, elem) {
					elem.style.display="none";
				})
			}
		}
		return item;
	}
}

function load_visible_objects( parms ) {
	var limit = (parms.limit ? "&limit="+parms.limit : "");
	var type = (parms.type ? "&type="+parms.type : "");
	$.ajax({
		url : "ems.wsgi?do=get&view=all&recursive=true"+limit+type,
		async : true,
		success :
	function( result ) {
		result = parse_result( result )
		for( i in result ) {
			show_object( {obj: result[i], dom_parent: $(".ems-content")[0], limit: limit} )
		}
	}})
}

function show_object( parms )
{
	var obj = parms.obj;
	var dom_parent = parms.dom_parent;
	var dom_child = parms.dom_child;
	var limit = parms.limit;
	var duplicates = parms.duplicates;
	var prepend = parms.prepend;
	var update = parms.update;
	if( obj.id && !obj.type )
	{
		$.get( "ems.wsgi?do=get&id="+obj.id+"&view=all&recursive=true"+(limit ? "&limit="+limit : ""),
		function( result )
		{
			result = parse_result( result )
			if( result.succeeded==undefined )
			{
				for( i in result )
				{
					var merged_obj = {}
					for( key in obj ) merged_obj[key] = obj[key];
					for( key in result[i] ) merged_obj[key] = result[i][key];
					show_object( {obj:merged_obj, dom_parent:$(".ems-content")[0], limit:limit, prepend:prepend, update:update} )
				}
			}
		})
	}
	if( obj.type == "application/x-obj.group" )
	{
		var item = new_item( {obj:obj, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates, prepend:prepend, update:update} )
		if( dom_parent ) {
			for( var i in obj.children ) {
				show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item)[0], limit:limit, update:update} )
			}
		}
	}
	if( obj.type == "application/x-obj.user" )
	{
		var item = new_item( {obj:obj, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates, prepend:prepend, update:update} )
		if( obj.avatar_id ) {
			replace_user_image( item, obj.avatar_id );
		}
		if( dom_parent ) {
			for( var i in obj.children ) {
				show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item)[0], limit:limit, update:update} )
			}
		}
	}
	if( obj.type == "application/x-obj.entry" )
	{
		var item = new_item( {obj:obj, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates, prepend:prepend, update:update} )
		if( dom_parent ) {
			for( var i in obj.children ) {
				show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item)[0], limit:limit, update:update} )
			}
			for( var i in obj.parents ) {
				parent = obj.parents[i];
				if( parent.type == "application/x-obj.group" ) show_object( {obj:parent, dom_child:item, limit:limit, duplicates:true, update:update} );
			}
			for( var i in obj.parents ) {
				parent = obj.parents[i];
				if( parent.type == "application/x-obj.user" ) show_object( {obj:parent, dom_child:item, limit:limit, duplicates:true, update:update} );
			}
		}
	}
	if( obj.type == "text/plain" )
	{
		var div = $( "#entry-text-"+String(obj.id) )[0]
		if( !div )
		{
			div = $("#entry-text-template").first().clone()[0]
			div.id = "entry-text-"+String(obj.id)
			if( dom_parent ) dom_parent.appendChild( div );
		}
		div.style.display = ""
		$(div).html( obj.data.replace(/\r?\n$/,"").replace(/\r?\n/g,"<br/>") );
	}
}

function edit_entry( button )
{
	var typemod = "";
	var entry = $(button).closest(".ems-entry")[0];
	if( !entry ) {
		typemod = "new-";
		entry = $(button).closest(".ems-"+typemod+"entry")[0];
	}
	var title = $( "."+typemod+"entry-title", entry )[0]
	var content = $( "."+typemod+"entry-content", entry )[0]
	if( title ) {
		title.contentEditable = true
		if( title.innerHTML.length==0 || !content ) title.focus()
	}
	if( content ) {
		content.contentEditable = true
		if( title.innerHTML.length>0 ) content.focus()
	}
	// Standard-Toolbox verbergen und temporären Klon der Editieren-Toolbox für diesen Beitrag erzeugen:
	var std_tools = $( ".entry-tools", entry )[0];
	if( std_tools ) {
		std_tools.style.display="none";
		var edit_tools = $( ".new-entry-tools", $("#ems-new-entry") )[0];
		if( edit_tools ) {
			$(std_tools).after( $(edit_tools).clone() )
		}
	}
}

function get_plain_text( element )
{
	var current_plain_text = ""
	for( var i=0; i<element.childNodes.length; i++ )
	{
		var child = element.childNodes[i]
		if( child.nodeName!="#text" )
		{
			current_plain_text += get_plain_text( child )
			if( child.nodeName=="BR" || child.nodeName=="DIV" )
			{
				current_plain_text += "\n"
			}
		}
		else current_plain_text += child.textContent;
	}
	return current_plain_text;
}

function restore_standard_tools( entry ) {
	// temporären Klon der Editieren-Toolbox wieder aus diesem Beitrag löschen und Standard-Toolbox wieder anzeigen:
	var edit_tools = $( ".new-entry-tools", entry )[0];
	if( edit_tools ) {
		$(edit_tools).remove();
	}
	var std_tools = $( ".entry-tools", entry )[0];
	if( std_tools ) {
		std_tools.style.display="";
	}
}

function remove_new_entry_item( entry ) {
	// new-entry-Objekt weg legen, Pseudo-Item löschen und neues reguläres Entry-Objekt abrufen:
	var item = $(entry).closest(".ems-item")[0];
	entry.style.display = "none";
	$(".ems-content").first().after( entry );
	entry.data = {};
	$(item).remove();
}

function save_entry_plain( button ) {
	var typemod = "";
	var entry = $(button).closest(".ems-entry")[0];
	if( !entry ) {
		typemod = "new-";
		entry = $(button).closest(".ems-"+typemod+"entry")[0];
		// new-entry-Objekt mit einem neuen DB-Objekt assoziieren:
		new_item( {obj:{type: "application/x-obj.entry"}, dom_object: entry} );
	}
	var entry_id = entry.data.object_id;
	var title = $( "."+typemod+"entry-title", entry )[0]
	var content = $( "."+typemod+"entry-content", entry )[0]
	if( title ) {
		title.contentEditable = false
		var title_text = get_plain_text( title )
		$.ajax({
			url : "ems.wsgi?do=store&id="+String(entry_id),
			type : "POST",
			data : { title: title_text },
			async : false,
			success :
		function( result ) {
			result = parse_result( result )
		}})
	}
	if( content ) {
		content.contentEditable = false
		var content_text = get_plain_text( content )
		// Inhalt speichern:
		var part_id_list = []
		$.ajax({
			url : "ems.wsgi?do=store&type=text/plain&parent_id="+String(entry_id),
			type : "POST",
			data : { data: content_text },
			async : false,
			success :
		function( result ) {
			result = parse_result( result )
			if( result.succeeded ) {
				part_id_list.push( result.object_id )
			}
		}})
		// serverseitige Bereinigung alter Daten:
		$.ajax({
			url : "ems.wsgi?do=delete&parent_id="+String(entry_id)
				+"&child_not_in="+part_id_list.join(","),
			async : false,
			success :
		function( result ) {
			result = parse_result( result )
		}})
	}
	if( entry.id!="ems-new-entry" ) {
		restore_standard_tools( entry );
	}
	else {
		remove_new_entry_item( entry );
		show_object( {dom_parent: $(".ems-content")[0], obj: {id: entry_id}, prepend: true} );
	}
}

function new_response( user, button ) {
	var reference_item = undefined;
	if( button ) {
		reference_item = $(button).closest(".ems-item")[0];
	}
	var new_entry = $("#ems-new-entry")[0];
	var old_item = $(new_entry).closest('.ems-item')[0];
	if( reference_item ) {
		$(reference_item).before( new_entry );
	} else {
		$(".ems-content").first().prepend( new_entry );
	}
	if( old_item ) $(old_item).remove();
	$(new_entry).wrap( '<span class="ems-item"></span>' )
	$(".new-entry-title", new_entry).empty();
	$(".new-entry-content", new_entry).empty();
	if( reference_item ) {
		reference_title = $(".entry-title", reference_item).first().text();
		if( !reference_title.match(/^Re:/i) ) {
			reference_title = "Re: "+reference_title;
		}
		$(".new-entry-title", new_entry).text( reference_title );
	}
	new_entry.style.display="";
	new_item( {obj:user, duplicates: true, dom_child: new_entry} );
	edit_entry( new_entry );
}

function delete_entry( button ) {
	var entry = $(button).closest(".ems-entry")[0];
	$.ajax({
		url : "ems.wsgi?do=delete&id="+String(entry.data.object_id),
		success :
	function( result ) {
		result = parse_result( result );
		if( result.succeeded ) {
			var item = $(entry).closest(".ems-item").remove();
		}
	}})
}

function discard_response( button ) {
	var typemod = "";
	var entry = $(button).closest(".ems-entry")[0];
	if( !entry ) {
		typemod = "new-";
		entry = $(button).closest(".ems-"+typemod+"entry")[0];
		remove_new_entry_item( entry );
	}
	else {
		restore_standard_tools( entry );
		var title = $( "."+typemod+"entry-title", entry )[0]
		var content = $( "."+typemod+"entry-content", entry )[0]
		if( title ) {
			title.contentEditable = false;
		}
		if( content ) {
			content.contentEditable = false;
		}
		// Daten neu laden, um lokale Änderungen zu beseitigen:
		show_object( {dom_parent: $(".ems-content")[0], obj: {id: entry.data.object_id, dom_object: entry}, update: true} );
	}
}
