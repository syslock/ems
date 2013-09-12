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
			if( result.succeeded && result.id!=undefined ) {
				obj.id = result.id
				if( !parms.dom_object ) {
					// Neues Element im Browser anlegen:
					var item = new_item( parms )
					var button = $("."+short_type+"-edit",item)[0]
					if( button ) edit_entry( button )
				}
				else {
					$(parms.dom_object).data( {obj: obj} );
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
			item = $("#ems-"+short_type+"-template").first().clone()[0];
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
			$(item).data( {obj: obj} );
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

function create_download( obj ) {
	var link = $( '<a href="ems.wsgi?do=get&view=data&id='+String(obj.id)+'&attachement=true" class="download-link" ><img src="tango-scalable/actions/document-save.svg" class="download-icon" /></a>' );
	link.append( '<span class="download-title">'+obj.title+'</span><span class="download-size">('+prettyprint_size(obj.size)+')</span>' );
	link = link[0];
	$(link).data( {obj: obj} );
	obj.dom_object = link;
	return link;
}

function load_visible_objects( parms ) {
	var offset = (parms.offset ? "&offset="+parms.offset : "");
	var limit = (parms.limit ? "&limit="+parms.limit : "");
	var type = (parms.type ? "&type="+parms.type : "");
	var parent_ids = (parms.parent_ids ? "&parent_id="+parms.parent_ids.join(",") : "");
	var child_ids = (parms.child_ids ? "&child_id="+parms.child_ids.join(",") : "");
	$.ajax({
		url : "ems.wsgi?do=get&view=all&recursive=true"+offset+limit+type+parent_ids+child_ids,
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
	if( obj.id && !obj.type ) {
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
					show_object( {obj:merged_obj, dom_parent:dom_parent ? dom_parent : $(".ems-content")[0], limit:limit, prepend:prepend, update:update} )
				}
			}
		})
	} else if( obj.type == "application/x-obj.group" ) {
		var item = new_item( {obj:obj, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates, prepend:prepend, update:update} )
		if( dom_parent ) {
			for( var i in obj.children ) {
				show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item)[0], limit:limit, update:update} )
			}
		}
	} else if( obj.type == "application/x-obj.user" ) {
		var item = new_item( {obj:obj, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates, prepend:prepend, update:update} )
		if( obj.avatar_id ) {
			replace_user_image( item, obj.avatar_id );
		}
		if( dom_parent ) {
			/*for( var i in obj.children ) {
				show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item)[0], limit:limit, update:update} )
			}*/
		}
	} else if( obj.type == "application/x-obj.entry" ) {
		var item = new_item( {obj:obj, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates, prepend:prepend, update:update} )
		if( dom_parent ) {
			for( var i in obj.children ) {
				show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item)[0], limit:limit, update:update} )
			}
			for( var i in obj.parents ) {
				var parent = obj.parents[i];
				if( parent.type == "application/x-obj.group" ) show_object( {obj:parent, dom_child:item, limit:limit, duplicates:true, update:update} );
			}
			for( var i in obj.parents ) {
				var parent = obj.parents[i];
				if( parent.type == "application/x-obj.user" ) show_object( {obj:parent, dom_child:item, limit:limit, duplicates:true, update:update} );
			}
		}
	} else if( obj.type == "text/plain" ) {
		if( dom_parent && obj.data ) {
			obj.dom_object = $('<span>').attr( {class: 'entry-text'} )[0];
			$(obj.dom_object).text( obj.data );
			$(obj.dom_object).data( {obj: obj} );
			$(dom_parent).append( obj.dom_object );
		}
	} else if( obj.type == "text/html" ) {
		if( dom_parent && obj.data ) {
			obj.dom_object = $( obj.data )[0];
			$(obj.dom_object).data( {obj: obj} );
			$(dom_parent).append( obj.dom_object );
		}
	} else if( obj.type && obj.type.match(/^image\//) && obj.id ) {
		if( dom_parent ) {
			obj.dom_object = $('<img>').attr( {src: 'ems.wsgi?do=get&id='+obj.id+'&view=data', class: 'entry-media'} )[0];
			$(obj.dom_object).data( {obj: obj} );
			$(dom_parent).append( obj.dom_object );
		}
	} else if( obj.type && obj.type.match(/^video\//) && obj.id ) {
		if( dom_parent ) {
			var video_box = $('<span>').attr( {class: 'entry-media'} );
			obj.dom_object = video_box;
			$(obj.dom_object).data( {obj: obj} );
			var status = $('<span>').attr( {class: 'video-status'} )[0];
			$(video_box).append( status );
			var video = $('<video>').attr( {class: 'video', controls: '', preload: 'none'} )[0];
			video.onplay = function() { $(status).hide(); };
			video.onmouseover = function() { video.preload='metadata'; };
			$(video_box).append( video );
			$(status).append( $('<img>').attr({class: 'video-status-image', src: 'tango-scalable/categories/applications-system.svg'}) );
			var status_text = $('<span>').attr( {class: 'video-status-text'} );
			$(status).append( status_text );
			$(video_box).append( status );
			var conversion_callback = function(result) {
				result = parse_result( result );
				if( result.succeeded ) {
					var stale_source_count = 0;
					var ready_source_count = 0;
					$(status_text).empty();
					if( result.objects.length ) {
						for( var i=0; i<result.objects.length; i++ ) {
							conv_obj = result.objects[i];
							if( conv_obj.type.match('^video/.*') ) {
								if( conv_obj.size>0 ) {
									$(status_text).append( $('<span>').attr({class: 'video-status-success'}).text(conv_obj.type+": OK") );
									ready_source_count++;
									// ggf. neue Video-Source hinzufügen, falls nicht schon vorhanden:
									if( $('#source_'+conv_obj.id, video)[0]==undefined ) {
										var source = $('<source>').attr({id: 'source_'+conv_obj.id, src: 'ems.wsgi?do=get&id='+conv_obj.id+'&view=data'});
										$(source).data( {obj: conv_obj} );
										$(video).append( source );
									}
								} else {
									$(status_text).append( $('<span>').attr({class: 'video-status-warning'}).text(conv_obj.type+": processing") );
									stale_source_count++;
								}
							} else if( conv_obj.type.match('^image/.*') ) {
								if( conv_obj.size>0 ) {
									$(status_text).append( $('<span>').attr({class: 'video-status-success'}).text(conv_obj.type+": OK") );
									ready_source_count++;
									$(video).attr( {poster: 'ems.wsgi?do=get&id='+conv_obj.id+'&view=data'} );
								} else {
									$(status_text).append( $('<span>').attr({class: 'video-status-warning'}).text(conv_obj.type+": processing") );
									stale_source_count++;
								}
							}
						}
					}
					// Original-Video-Daten als Fallback für unfertige/fehlgeschlagene Konvertierung:
					if( $('#source_'+obj.id, video)[0]==undefined ) {
						$(video).append( $('<source>').attr({id: 'source_'+obj.id, src: 'ems.wsgi?do=get&id='+obj.id+'&view=data'}) );
					}
					// Wir gehen unter folgender Bedingung von einem Erfolg aus, woraufhin eine weitere Statusprüfung
					// unterlassen und die Statusanzeige versteckt werden kann:
					// Entweder haben wir mindestens eine fertige Source (ready_source_count>0) und das Video-Element ist 
					// NETWORK_IDLE, hat also eine gültige Quelle gefunden und wartet oder aber wir haben mindestens 
					// eine fertige Source (ready_source_count>0) und keine unfertige (stale_source_count==0) und das 
					// Video-Element glaubt nicht noch keine gültige Quelle gefunden zu haben (!=NETWORK_NO_SOURCE).
					if( (ready_source_count>0 && stale_source_count==0 && $(video)[0].networkState!=HTMLMediaElement.NETWORK_NO_SOURCE) ) {
						$(status).hide();
					} else {
						if( ready_source_count+stale_source_count==0 ) {
							// ggf. länger dauernde Anforderung für u.U. fehlende Konvertierungen:
							$.get( 'ems.wsgi?do=convert&mode=convert&id='+String(obj.id)+'&view=all', conversion_callback );
						}
						setTimeout( function() {
							// Schnell-Lookup von bereits vorhandenen Konvertierungen wiederholen:
							$.get( 'ems.wsgi?do=convert&mode=status&id='+String(obj.id)+'&view=all', conversion_callback );
						}, 5000 );
					}
				}
			};
			// Schnell-Lookup von bereits vorhandenen Konvertierungen:
			$.get( 'ems.wsgi?do=convert&mode=status&id='+String(obj.id)+'&view=all', conversion_callback );
			$(dom_parent).append( obj.dom_object );
		}
	} else if( obj.type && obj.type=="application/x-obj.tag" ) {
		if( dom_parent ) {
			obj.dom_object = $('#entry-tag-template').clone().attr( {id: undefined, title: obj.title} )[0];
			$(obj.dom_object).data( {obj: obj} );
			var tag_label_obj = $('.entry-tag-label', obj.dom_object)[0];
			var tag_label_limit = 30;
			var tag_label = obj.title.length<=20 ? obj.title : obj.title.substr(0,tag_label_limit-3)+"...";
			$(tag_label_obj).text( tag_label );
			$('.entry-tag-tool-filter-for', obj.dom_object)[0].onclick = function(ev) {
				var parms = {}; parms[obj.id] = obj;
				apply_page_filter( parms );
			};
			$('.entry-tag-tool-filter-exclude', obj.dom_object)[0].onclick = function(ev) {
				var parms = {}; parms[-obj.id] = obj;
				apply_page_filter( parms );
			};
			if( $(dom_parent).hasClass('entry-tags-selection') ) {
				$(dom_parent).append( obj.dom_object );
				$('.entry-tag-add', obj.dom_object).show();
				$('.entry-tag-remove', obj.dom_object).hide();
			} else {
				$(dom_parent).closest('.ems-entry').find('.entry-tags-content').append( obj.dom_object );
				$('.entry-tag-add', obj.dom_object).hide();
				$('.entry-tag-remove', obj.dom_object).show();
			}
			obj.dom_object.style.display="";
		}
	} else if( dom_parent && obj.id ) {
		var download_link = create_download( obj );
		$(dom_parent).append( download_link );
	}
}

var filter_list = []
function apply_page_filter( parms ) {
	if( parms==undefined ) parms={};
	$('.filter-item-include').each( function(i, elem) {
		var obj = $(elem).data().obj;
		if( parms[-obj.id] ) {
		} else if( parms[obj.id] ) {
		} else {
			parms[obj.id] = obj;
		}
	});
	$('.filter-item-exclude').each( function(i, elem) {
		var obj = $(elem).data().obj;
		if( parms[-obj.id] ) {
		} else if( parms[obj.id] ) {
		} else {
			parms[-obj.id] = obj;
		}
	});
	filter_list = []
	var filter_view = $('.page-filter-view')[0];
	$(filter_view).empty();
	for( key in parms ) {
		var obj = parms[key];
		if( obj ) {
			filter_list.push( key );
			var filter_item = $('<span>').attr( {'class':(Number(key)<0 ? 'filter-item filter-item-exclude' : 'filter-item filter-item-include')} )[0];
			$(filter_item).text( obj.title );
			$(filter_item).data( {obj: obj} );
			obj.dom_object = filter_item;
			filter_item.onclick = function(ev) {
				$(this).remove();
				apply_page_filter();
			};
			$(filter_view).append( filter_item );
		}
	}
	var page_filter = $('.page-filter')[0];
	if( filter_list.length>0 ) {
		$(page_filter).addClass( 'page-filter-active' );
	} else {
		$(page_filter).removeClass( 'page-filter-active' );
	}
	$('.ems-content').empty();
	var scroll_offset = 0;
	var scroll_step = 10;
	var scroll_time = (new Date()).getTime();
	load_visible_objects( {offset: scroll_offset, limit: scroll_step, type: 'application/x-obj.entry', child_ids: filter_list} );
	window.addEventListener(
		'scroll',
		function() {
			var scrollTop = document.documentElement.scrollTop ||
				document.body.scrollTop;
			var offsetHeight = document.body.offsetHeight;
			var clientHeight = document.documentElement.clientHeight;
			if (offsetHeight <= scrollTop + clientHeight) {
				// Scroll end detected
				var new_scroll_time = (new Date()).getTime();
				if( new_scroll_time-scroll_time > 1000 ) {
					// Mindestwartezeit für Nachladeaktionen überschritten
					scroll_time = new_scroll_time;
					scroll_offset += scroll_step;
					load_visible_objects( {offset: scroll_offset, limit: scroll_step, type: 'application/x-obj.entry', child_ids: filter_list} );
				}
			}
		},
		false
	);
}

function edit_entry( button )
{
	var entry = $(button).closest(".ems-entry")[0];
	$(entry).addClass("new-entry");
	var title = $( ".entry-title", entry )[0]
	var content = $( ".entry-content", entry )[0]
	if( title ) {
		title.contentEditable = true
		if( title.innerHTML.length==0 || !content ) title.focus()
	}
	if( content ) {
		content.contentEditable = true
		if( title.innerHTML.length>0 ) content.focus()
	}
	
	// Standard-Toolbox verbergen und Editieren-Toolbox anzeigen:
	var std_tools = $( ".entry-tools", entry )[0];
	$(std_tools.style).hide();
	var edit_tools = $( ".entry-edit-tools", entry )[0];
	$(edit_tools).show();
	// Themen des Beitrages kopieren:
	$(".entry-tags",edit_tools).empty().append( $(".entry-tags",std_tools).clone(true,true).contents() );
}

function get_plain_text( element ) {
	var current_plain_text = "";
	for( var i=0; i<element.childNodes.length; i++ ) {
		var child = element.childNodes[i];
		if( child.nodeName!="#text" ) {
			current_plain_text += get_plain_text( child );
			if( child.nodeName=="BR" || child.nodeName=="DIV" ) {
				current_plain_text += "\n";
			}
		}
		else current_plain_text += child.textContent;
	}
	return current_plain_text;
}

function get_object_list( element, text_obj ) {
	var current_list = [];
	if( element.nodeName=="#text" ) {
		var obj = { 'type': 'text/plain', 'data': element.textContent };
		if( text_obj && text_obj.unassigned ) {
			obj.id = text_obj.id;
			text_obj.unassigned = false;
			if( obj.data != text_obj.data ) {
				obj.changed = true;
			} else {
				obj.changed = false;
			}
		}
		if( obj.data.replace(/\s/g,'').length ) {
			// Nur nichtleere Texte übernehmen
			current_list.push( obj );
		}
	} else if( element.nodeName=="BR" ) {
		if( $(element).data().obj ) {
			current_list.push( $(element).data().obj );
		} else {
			var obj = { 'type': 'text/html', 'data': element.outerHTML };
			current_list.push( obj );
		}
	} else if( $(element).data().obj ) {
		current_list.push( $(element).data().obj );
	}
	if( !$(element).data().obj || $(element).data().obj.type=="text/plain" ) {
		if( $(element).data().obj && $(element).data().obj.type=="text/plain" ) {
			text_obj = $(element).data().obj;
			text_obj.unassigned = true;
		}
		for( var i=0; i<element.childNodes.length; i++ ) {
			var child = element.childNodes[i];
			current_list = current_list.concat( get_object_list(child, text_obj) );
		}
	}
	return current_list;
}

function restore_standard_tools( entry ) {
	// temporären Klon der Editieren-Toolbox wieder aus diesem Beitrag löschen und Standard-Toolbox wieder anzeigen:
	var edit_tools = $( ".entry-edit-tools", entry )[0];
	$(edit_tools).hide();
	var std_tools = $( ".entry-tools", entry )[0];
	$(std_tools).show();
}

function remove_new_entry_item( entry ) {
	// neues entry-Objekt und Pseudo-Item löschen:
	var item = $(entry).closest(".ems-item")[0];
	$(item).remove();
}

function save_entry( button ) {
	var entry = $(button).closest(".ems-entry")[0];
	$(entry).removeClass("new-entry");
	var new_entry_created = false;
	if( !$(entry).data().obj || !$(entry).data().obj.id ) {
		// neues entry-Objekt mit einem neuen DB-Objekt assoziieren:
		new_item( {obj:{type: "application/x-obj.entry"}, dom_object: entry} );
		new_entry_created = true;
	}
	var entry_id = $(entry).data().obj.id;
	var title = $( ".entry-title", entry )[0];
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
	var content = $( ".entry-content", entry )[0];
	if( content ) {
		content.contentEditable = false
		var content_list = get_object_list( content );
		var tags = $( ".entry-tags-content", entry )[0];
		if( tags ) {
			content_list = content_list.concat( get_object_list(tags) );
		}
		// Inhalt speichern:
		var part_id_list = []
		for( var i in content_list ) {
			var obj = content_list[i];
			if( obj.id==undefined && obj.type && obj.data ) {
				// neu zu speichernde Objekte mit Inhalt, ohne bestehende ID-Zuordnung:
				// (bisher nur text/plain)
				$.ajax({
					url : "ems.wsgi?do=store&type="+obj.type+"&parent_id="+String(entry_id)+"&sequence="+String(i),
					type : "POST",
					data : { data: obj.data },
					async : false, /* hier, ohne komplizierteres Event-Hanlding, wichtig zur Vermeidung von Race-Conditions */
					success :
				function( result ) {
					result = parse_result( result )
					if( result.succeeded ) {
						part_id_list.push( result.id )
					}
				}})
			} else if( obj.id && (obj.unassigned==undefined || obj.unassigned==true || obj.changed==true) ) {
				// bereits gespeicherte oder lokal geänderte Objekte, mit bestehender ID-Zuordnung, 
				// die dem Eintrag in korrekter Sequenz (neu) zugewiesen oder gespeichert werden müssen:
				$.ajax({
					url : "ems.wsgi?do=store&id="+obj.id+"&parent_id="+String(entry_id)+"&sequence="+String(i),
					type : obj.changed ? "POST" : "GET",
					data : obj.changed ? { data: obj.data } : undefined,
					async : false, /* hier, ohne komplizierteres Event-Hanlding, wichtig zur Vermeidung von Race-Conditions */
					success :
				function( result ) {
					result = parse_result( result )
					if( result.succeeded ) {
						part_id_list.push( result.id )
					}
				}})
			}
		}
		// serverseitige Bereinigung alter Daten:
		// (Damit das so funktioniert, ist es wichtig, dass der Neuzuordnungsfall bestehender Objekte (2. Fall oben)
		//  eine Duplikatbehandlung der Eltern-Kind-Beziehungen vornimmt, sodass bestehende Zuordnungen aktualisiert
		//  (Sequenz) und nicht vermehrt werden...)
		$.ajax({
			url : "ems.wsgi?do=delete&parent_id="+String(entry_id)
				+"&child_not_in="+part_id_list.join(","),
			async : false,
			success :
		function( result ) {
			result = parse_result( result )
		}})
	}
	if( new_entry_created ) {
		remove_new_entry_item( entry );
		show_object( {dom_parent: $(".ems-content")[0], obj: {id: entry_id}, prepend: true} );
	} else {
		restore_standard_tools( entry );
	}
}

function new_response( user, button ) {
	var reference_item = undefined;
	if( button ) {
		reference_item = $(button).closest(".ems-item")[0];
	}
	var new_entry = $("#ems-entry-template").first().clone()[0];
	new_entry.id="";
	if( reference_item ) {
		$(reference_item).before( new_entry );
	} else {
		$(".ems-content").first().prepend( new_entry );
	}
	$(new_entry).wrap( '<span class="ems-item"></span>' )
	if( reference_item ) {
		// Antworttitel aus Titel des Referenzbeitrages generieren:
		reference_title = $(".entry-title", reference_item).first().text();
		if( !reference_title.match(/^Re:/i) ) {
			reference_title = "Re: "+reference_title;
		}
		$(".entry-title", new_entry).text( reference_title );
		// Themen des Referenzbeitrages kopieren:
		var ref_tools = $( ".entry-tools", reference_item )[0];
		var new_tools = $( ".entry-tools", new_entry )[0];
		$(".entry-tags",new_tools).empty().append( $(".entry-tags",ref_tools).clone(true,true).contents() );
	}
	new_entry.style.display="";
	user_element = new_item( {obj:user, duplicates: true, dom_child: new_entry} );
	if( user_element && user.avatar_id ) {
		replace_user_image( user_element, user.avatar_id );
	}
	edit_entry( new_entry );
}

function delete_entry( button ) {
	var entry = $(button).closest(".ems-entry")[0];
	$.ajax({
		url : "ems.wsgi?do=delete&id="+String($(entry).data().obj.id),
		success :
	function( result ) {
		result = parse_result( result );
		if( result.succeeded ) {
			var item = $(entry).closest(".ems-item").remove();
		}
	}})
}

function discard_response( button ) {
	var entry = $(button).closest(".ems-entry")[0];
	$(entry).removeClass("new-entry");
	if( !$(entry).data().obj || !$(entry).data().obj.id ) {
		remove_new_entry_item( entry );
	}
	else {
		restore_standard_tools( entry );
		var title = $( ".entry-title", entry )[0]
		var content = $( ".entry-content", entry )[0]
		if( title ) {
			title.contentEditable = false;
		}
		if( content ) {
			content.contentEditable = false;
		}
		// Daten neu laden, um lokale Änderungen zu beseitigen:
		$(".entry-content", entry).empty()
		$(".entry-tags-content", entry).empty()
		show_object( {dom_parent: entry, obj: $(entry).data().obj, update: true} );
	}
}

function add_file( button ) {
	var entry = $(button).closest(".ems-entry")[0];
	var content = $(".entry-content", entry)[0];
	var selection = window.getSelection();
	var range = selection.getRangeAt(0);
	var upload_dialog = $(".upload-dialog-template").clone()[0];
	upload_dialog.className = "upload-dialog";
	upload_dialog.style.display="";
	range.insertNode( upload_dialog );
	selection.collapseToStart(); // verhindert automatische Auswahl des Dialogfeldes
	upload_dialog.contentEditable = false; // verhindert Editierbarkeit des Dialogfeldes
	var preview_area = $(".upload-preview", upload_dialog)[0];
	var upload_progress = $(".upload-progress", upload_dialog)[0];
	$(preview_area).bind( "dragover", function(event) {
		return false;
	});
	$(preview_area).bind( "dragenter", function(event) {
		$(event.delegateTarget).addClass('upload-preview-over');
		return false;
	});
	$(preview_area).bind( "dragleave", function(event) {
		$(event.delegateTarget).removeClass('upload-preview-over');
		return false;
	});
	$(preview_area).bind( "drop", function(event) {
		$(event.delegateTarget).removeClass('upload-preview-over');
		var dt = event.originalEvent.dataTransfer;
		try {
			form_data = new FormData()
			for( var i=0; i<dt.files.length; i++ ) {
				var file = dt.files[i];
				form_data.append( "file-"+String(i), file )
			}
			$.ajax({
				url : "ems.wsgi?do=store",
				type : "POST",
				data : form_data,
				contentType: false, /*form_data den Content-Type bestimmen lassen*/
				processData: false, /*jede Zwischenverarbeitung untersagen, die Daten sind ok so...*/
				xhr :
			function() {
				var xhr = new window.XMLHttpRequest();
				xhr.upload.addEventListener( "progress", function(evt) {
					if( evt.lengthComputable ) {
						var percentComplete = 100 * evt.loaded / evt.total;
						var progress_string = String(Math.round(percentComplete))+"%";
						$(upload_progress).width( progress_string );
						$(upload_progress).text( progress_string );
					}
				}, false );
				return xhr;
			},
				success :
			function( result ) {
				result = parse_result( result );
				if( result.succeeded ) {
					var upload_id = result.id;
					$.ajax({
						url : "ems.wsgi?do=get&view=all&id="+String(upload_id),
						success :
					function( result ) {
						result = parse_result( result );
						if( result && result.length ) {
							var meta = result[0];
							if( meta.title ) $('.upload-title',upload_dialog).text( meta.title );
							if( meta.type ) $('.upload-type',upload_dialog).text( "["+meta.type+"]" );
							if( meta.size ) $('.upload-size',upload_dialog).text( prettyprint_size(meta.size) );
						   $(preview_area).empty();
							show_object( {obj: meta, dom_parent: preview_area} );
							if( meta.dom_object ) { 
								$(meta.dom_object).addClass('upload-object');
								$(meta.dom_object).addClass('upload-preview-content');
							}
						}
					}});
				}
			}});
		} catch( error ) {
			show_message( "Beim Hochladen der Datei ist ein Fehler aufgetreten. Eventuell unterstützt dein Browser die verwendeten Schnittstellen noch nicht." )
			show_error( error );
		}
		return false;
	});
}

function close_upload_dialog( button ) {
	$(button).closest(".upload-dialog").remove();
}

function confirm_upload( button ) {
	var upload_dialog = $(button).closest(".upload-dialog")[0];
	var upload_object = $('.upload-object', upload_dialog)[0];
	$(upload_dialog).after( upload_object );
	if( $(upload_object).hasClass('download-link') ) {
		// fancy.css braucht wegen eines Offset-Bugs einen zusätzlichen Zeilenumbruch nach Links:
		$(upload_object).after( '<br>' );
	}
	upload_object.contentEditable = false; // verhindert Editierbarkeit des Links
	close_upload_dialog( button );
}

function show_tag_selection( button ) {
	var entry_tools = $(button).closest(".entry-tools")[0];
	var entry_tags = $(button).closest(".entry-tags")[0];
	var tags_selection = $(".entry-tags-selection", entry_tags)[0];
	$.get( "ems.wsgi?do=get&type=application/x-obj.tag&limit=50", 
	function( result ) {
		result = parse_result( result );
		if( !result.error ) {
			$(tags_selection).empty();
			
			var new_tag_input = $('<input>').attr({
				class: 'entry-tag entry-tags-selection-item', title: 'Neues Thema',
			})[0];
			$(new_tag_input).data( {obj: {type:'application/x-obj.tag'}} );
			new_tag_input.onkeypress = function(event) { onenter(event,add_tag,this); };
			$(tags_selection).append( new_tag_input );
			
			for( var i in result ) {
				var obj = result[i];
				show_object( {obj: obj, dom_parent: tags_selection} );
				$(obj.dom_object).addClass('entry-tags-selection-item');
			}
			
			tags_selection.style.display = "";
			new_tag_input.focus();
			
			$(entry_tools).bind('mouseleave', function(event) {
				tags_selection.style.display = 'none';
				$(this).unbind('mouseleave');
			});
		}
	});
}

function add_tag( button ) {
	var entry = $(button).closest(".ems-entry")[0];
	var entry_id = $(entry).data().obj ? $(entry).data().obj.id : undefined;
	var entry_id_query = entry_id ? ","+String(entry_id) :"";
	var tag = $(button).closest('.entry-tag')[0];
	tag = tag ? tag : button;
	var tag_id = $(tag).data().obj.id;
	var tag_id_query = tag_id ? "&id="+String(tag_id) : "";
	var tag_title_query = tag_id ? "" : "&title="+$(tag)[0].value;
	var tag_type_query = tag_id ? "" : "&type="+$(tag).data().obj.type;
	var tags_selection = $(button).closest('.entry-tags-selection')[0];
	var tags_content = $('.entry-edit-tools .entry-tags-content',entry)[0];
	$.get( "ems.wsgi?do=store&parent_id=5"+entry_id_query+tag_id_query+tag_title_query+tag_type_query, 
	function( result ) {
		result = parse_result( result );
		if( result.succeeded ) {
			tag_id = result.id;
			tags_selection.style.display = 'none';
			if( entry_id ) {
				// Daten neu laden, um Änderungen zu übernehmen:
				$.get( "ems.wsgi?do=get&id="+String(entry_id)+"&view=all&recursive=true",
				function( result ) {
					result = parse_result( result );
					if( !result.error && result.length ) {
						obj = result[0];
						$(".entry-content", entry).empty()
						$(".entry-tags-content", entry).empty()
						show_object( {dom_parent: entry, obj: obj, update: true} );
					}
				});
			} else {
				show_object( {dom_parent: tags_content, obj: {id: tag_id}} );
			}
		}
	});
}

function remove_tag( button ) {
	var entry = $(button).closest(".ems-entry")[0];
	var tag = $(button).closest('.entry-tag')[0];
	if( !$(entry).data().obj || !$(entry).data().obj.id ) {
		$(tag).remove();
		return;
	}
	var entry_id = $(entry).data().obj.id;
	var tag_id = $(tag).data().obj.id;
	var tag_id_query = "&id="+String(tag_id);
	var tags_content = $(button).closest('.entry-tags-content')[0];
	$.get( "ems.wsgi?do=delete&parent_id="+String(entry_id)+tag_id_query, 
	function( result ) {
		result = parse_result( result );
		if( result.succeeded ) {
			$(tag).remove();
		}
	});
}