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
				parms.id = result.object_id
				if( !parms.dom_object )
				{
					// Neues Element im Browser anlegen:
					var item = new_item( parms )
					var button = $("."+short_type+"-edit",item)[0]
					if( button ) edit_entry( button )
				}
				else
				{
					parms.dom_object.data = {
						"object_id" : parms.id,
					}
				}
			}
		}})
		return undefined;
	}
	else
	{
		var item = parms.dom_object;
		if( !item && !parms.duplicates )
		{
			item = $("#ems-"+short_type+"-"+String(parms.id))[0]
		}
		if( !item )
		{
			item = $("#ems-"+short_type+"-template").first().clone(true)[0];
			item.id = "ems-"+short_type+"-"+String(parms.id)
			item.style.display = ""
			if( parms.dom_parent ) {
				$(parms.dom_parent).first().append( item );
				// Im DOM eingehängte Objekte kapseln wir auf der obersten Ebene mit .ems-item
				$(item).wrap( '<span class="ems-item"></span>' );
			} else if( parms.dom_child ) {
				$(parms.dom_child).first().before( item );
				$("."+short_type+"-content",item).append( parms.dom_child );
			}
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
			var item_field = $( "."+short_type+"-"+field_name, item ).first().html( parms[field_name] )
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
					show_object( {obj:merged_obj, dom_parent:$(".ems-content")[0], limit:limit} )
				}
			}
		})
	}
	if( obj.type == "application/x-obj.group" )
	{
		var item = new_item( {type:obj.type, id:obj.id, name:obj.name, dom_object:obj.dom_object, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates} )
		if( dom_parent ) {
			for( var i in obj.children ) {
				show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item)[0], limit:limit} )
			}
		}
	}
	if( obj.type == "application/x-obj.user" )
	{
		var item = new_item( {type:obj.type, id:obj.id, nick:obj.nick, dom_object:obj.dom_object, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates} )
		if( dom_parent ) {
			for( var i in obj.children ) {
				show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item)[0], limit:limit} )
			}
		}
	}
	if( obj.type == "application/x-obj.entry" )
	{
		var item = new_item( {type:obj.type, id:obj.id, title:obj.title, dom_object:obj.dom_object, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates} )
		if( dom_parent ) {
			for( var i in obj.children ) {
				show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item)[0], limit:limit} )
			}
			for( var i in obj.parents ) {
				parent = obj.parents[i];
				if( parent.type == "application/x-obj.group" ) show_object( {obj:parent, dom_child:item, limit:limit, duplicates:true} );
			}
			for( var i in obj.parents ) {
				parent = obj.parents[i];
				if( parent.type == "application/x-obj.user" ) show_object( {obj:parent, dom_child:item, limit:limit, duplicates:true} );
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
	var title = $(".entry-title",$(button).closest(".ems-entry"))[0]
	var content = $(".entry-content",$(button).closest(".ems-entry"))[0]
	if( title ) {
		title.contentEditable = true
		if( title.innerHTML.length==0 || !content ) title.focus()
	}
	if( content ) {
		content.contentEditable = true
		if( title.innerHTML.length>0 ) content.focus()
	}
	button.style.display="none"
	$(".entry-save",$(button).closest(".ems-entry"))[0].style.display=""
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

function save_entry_plain( button )
{
	var entry_id = $(button).closest(".ems-entry")[0].data.object_id
	var title = $(".entry-title",$(button).closest(".ems-entry"))[0]
	var content = $(".entry-content",$(button).closest(".ems-entry"))[0]
	if( title ) 
	{
		title.contentEditable = false
		var title_text = get_plain_text( title )
		$.ajax({
			url : "ems.wsgi?do=store&id="+String(entry_id),
			type : "POST",
			data : { title: title_text },
			async : false,
			success :
		function( result )
		{
			result = parse_result( result )
		}})
	}
	if( content )
	{
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
		function( result )
		{
			result = parse_result( result )
			if( result.succeeded )
			{
				part_id_list.push( result.object_id )
			}
		}})
		// serverseitige Bereinigung alter Daten:
		$.ajax({
			url : "ems.wsgi?do=delete&parent_id="+String(entry_id)
				+"&child_not_in="+part_id_list.join(","),
			async : false,
			success :
		function( result )
		{
			result = parse_result( result )
		}})
	}
	button.style.display="none"
	$(".entry-edit",$(button).closest(".ems-entry"))[0].style.display=""
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
	$("new-entry-title", new_entry).empty();
	$("new-entry-content", new_entry).empty();
	new_entry.style.display="";
	var new_user_obj = $.extend( {duplicates: true, dom_child: new_entry}, user );
	new_item( new_user_obj );
}
