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
		var get_args = { type : obj.type };
		// optionale Zusatzparameter:
		if( obj.title ) get_args["title"]=obj.title;
		if( obj.nick ) get_args["nick"]=obj.nick;
		if( obj.name ) get_args["name"]=obj.name;
		get_module( 'store', {
			args : get_args,
			async : false, // TODO: Sicherstellen, dass new_item nur in asynchronen Request-Handlern aufgerufen wird!
			done : function( result ) {
				result = parse_result( result )
				if( result.succeeded && result.id!=undefined ) {
					obj.id = Number(result.id)
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
			}
		});
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
				$(item).wrap( '<div class="ems-item"></div>' );
			} else if( parms.dom_child ) {
				$(parms.dom_child).first().before( item );
				$("."+short_type+"-content",item).append( parms.dom_child );
			}
			$(item).data( {obj: obj} );
		}
		if( !obj.dom_object ) obj.dom_object = item;
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
				$( "."+short_type+"-"+field_name, item ).first().text( value );
			}
		}
		if( obj.ctime && obj.mtime && Math.round(obj.ctime/60)==Math.round(obj.mtime/60) ) {
			$( "."+short_type+"-mtime", item ).first().hide();
		}
		for( permission in {"read":1,"write":1,"delete":1,"insert":1} ) {
			// show/hide child elements depending on permission markers related to the object:
			if( $.inArray(permission, obj.permissions)==-1 ) {
				$( ".require-permission-"+permission+"-"+short_type, item ).hide();
			} else {
				$( ".require-permission-"+permission+"-"+short_type, item ).show();
			}
			// show/hide child elements depending on permission marker related to the user:
			if( global_user && $.inArray(permission, global_user.permissions)!=-1 ) {
				$( ".require-permission-"+permission+"-self", item ).show();
			} else {
				$( ".require-permission-"+permission+"-self", item ).hide();
			}
		}
		return item;
	}
}

function create_download( obj ) {
	var prettyprint_title = function(obj) {
		return (obj.title ? obj.title : 'file_'+String(obj.id)+'.'+obj.type.match(/.*\/(.*)/)[1])
	}
	var link = $('<a></a>').attr({
		href: get_module_url( "get", {view : "data", id : obj.id, attachment : true} ),
		target: '_blank', title: prettyprint_title(obj)+' herunterladen...', 
		class: 'download-link', download: prettyprint_title(obj)
	}).append( $('<img />').attr({ 
		src: 'tango-scalable/actions/document-save.svg', 
		class: 'download-icon' 
	}));
	link.append( '<div class="download-title">'+obj.title+'</div><div class="download-size">('+prettyprint_size(obj.size)+')</div>' );
	link = link[0];
	$(link).data( {obj: obj} );
	obj.dom_object = link;
	return link;
}

function load_visible_objects( parms ) {
	var get_args = { view : "all", recursive : true };
	if( parms.offset ) get_args.offset = parms.offset;
	if( parms.limit ) get_args.limit = parms.limit;
	if( parms.type ) get_args.type = parms.type;
	if( parms.ids && parms.ids.length ) get_args.id = parms.ids.join(",");
	if( parms.parent_ids && parms.parent_ids.length ) get_args.parent_id = parms.parent_ids.join(",");
	if( parms.child_ids && parms.child_ids.length ) get_args.child_id = parms.child_ids.join(",");
	if( parms.permissions && parms.permissions.length ) get_args.permissions = parms.permissions.join(",");
	var dom_parent = (parms.dom_parent ? parms.dom_parent : $(".ems-content")[0]);
	GlobalRequestQueue.add( {
		module : "get",
		args : get_args,
		done : function( result ) {
			result = parse_result( result );
			for( i in result ) {
				show_object( {obj: result[i], dom_parent: dom_parent, limit: parms.limit} );
			}
		}
	});
	GlobalRequestQueue.process();
}

function show_search_result( parms ) {
	var dom_parent = (parms.dom_parent ? parms.dom_parent : $(".ems-content")[0]);
	for( i in parms.hitlist ) {
		show_object( {obj: parms.hitlist[i], dom_parent: dom_parent, limit: parms.limit} )
	}
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
		var get_args = { id : obj.id, view : 'all', recursive : 'true' };
		if( limit ) get_args['limit'] = limit;
		get_module( 'get', {
			args : get_args,
			done : function( result ) {
				result = parse_result( result )
				if( result.succeeded==undefined ) { // FIXME: Get rid of result.succeeded once and for all?
					for( i in result ) {
						var merged_obj = {}
						for( key in obj ) merged_obj[key] = obj[key];
						for( key in result[i] ) merged_obj[key] = result[i][key];
						show_object( {obj:merged_obj, dom_parent:(dom_parent ? dom_parent : (!dom_child) ? $(".ems-content")[0] : undefined), dom_child:dom_child, duplicates:duplicates, limit:limit, prepend:prepend, update:update} )
					}
				}
			}
		});
	} else if( obj.type == "application/x-obj.group" ) {
		var item = new_item( {obj:obj, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates, prepend:prepend, update:update} )
		if( dom_parent ) {
			for( var i in obj.children ) {
				show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item)[0], limit:limit, update:update} )
			}
		}
	} else if( obj.type == "application/x-obj.minion" ) {
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
		var entry_author = $('.entry-author', item)[0];
		if( dom_parent ) {
			for( var i in obj.children ) {
				show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item)[0], limit:limit, update:update} )
			}
			var user_found = false;
			for( var i in obj.parents ) {
				var parent = obj.parents[i];
				if( parent.type == "application/x-obj.user" ) {
					user_found = true;
					show_object( {obj:parent, dom_parent:entry_author, limit:limit, duplicates:true, update:update} );
				}
			}
			if( !user_found ) {
				show_object( {obj:{id:3}, dom_parent:entry_author, limit:limit, duplicates:true, update:update} );
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
			obj.dom_object = $('<img>').attr( {src: get_module_url("get", {id : obj.id, view : "data"}), class: 'entry-media'} )[0];
			$(obj.dom_object).data( {obj: obj} );
			$(dom_parent).append( obj.dom_object );
		}
	} else if( obj.type && obj.type.match(/^video\//) && obj.id ) {
		if( dom_parent ) {
			var video_box = $('<div>').attr( {class: 'entry-media'} );
			obj.dom_object = video_box;
			$(obj.dom_object).data( {obj: obj} );
			var status = $('<div>').attr( {class: 'video-status'} )[0];
			$(video_box).append( status );
			var video = $('<video>').attr( {class: 'video', controls: '', preload: 'none'} )[0];
			video.onplay = function() { $(status).hide(); };
			video.onmouseover = function() { video.preload='metadata'; };
			$(video_box).append( video );
			$(status).append( $('<img>').attr({class: 'video-status-image', src: 'tango-scalable/categories/applications-system.svg'}) );
			var status_text = $('<div>').attr( {class: 'video-status-text'} );
			$(status).append( status_text );
			$(video_box).append( status );
			var variants = $('<div>').attr( {class: 'video-variants'} )[0];
			$(video_box).append( variants );
			var identification_callback = function(raw_result) {
				var result = parse_result( raw_result );
				if( result.succeeded ) {
					$(variants).empty();
					for( var i=0; i<result.objects.length; i++ ) {
						var variant_obj = result.objects[i];
						var variant = $('<div>').attr( {class: 'video-variant'} )[0];
						if( video.canPlayType(variant_obj.type) ) {
							$(variant).addClass( 'canplay' );
						} else {
							$(variant).addClass( 'cannotplay' );
						}
						if( $(video).data("selected_variant_id")==variant_obj.id ) {
							$(variant).addClass( 'selected' );
						}
						$(variant).data( {obj: variant_obj} );
						$(variant).bind( 'click', function(event) {
							// FIXME: variant_obj.id hat immer den selben Wert!
							// Wir müssen die Variant-Elemente mit ihren DB-Objekten assoziieren und diese hier aus
							// dem DOM abrufen...
							var variant_obj = $(event.target).closest('.video-variant').data("obj");
							video.src = get_module_url( "get", {id : variant_obj.id, view : "data"} );
							$(video).data( {selected_variant_id: variant_obj.id} );
							identification_callback( raw_result );
						});
						var Bps = Number(variant_obj.size) / Number(variant_obj.mplayer.id.length);
						$(variant).text( variant_obj.type+" "+String(variant_obj.mplayer.id.video.width)+"x"+String(variant_obj.mplayer.id.video.height)+" "+prettyprint_size(Bps)+"/s" );
						$(variant).append( '&nbsp;' );
						$(variant).append( create_download(variant_obj) );
						$(variants).append( variant );
					}
				}
			}
			var conversion_callback = function(result) {
				result = parse_result( result );
				if( result.succeeded ) {
					var stale_source_count = 0;
					var ready_source_count = 0;
					var identification_request_list = [ obj.id ];
					$(status_text).empty();
					if( result.substitutes.length ) {
						for( var i=0; i<result.substitutes.length; i++ ) {
							var substitute = result.substitutes[i]
							var conv_obj = substitute.substitute_object[0];
							if( conv_obj.type.match('^video/.*') ) {
								if( conv_obj.size>0 ) {
									$(status_text).append( $('<div>').attr({class: 'video-status-success'}).text(conv_obj.type+": OK") );
									ready_source_count++;
									// ggf. neue Video-Source hinzufügen, falls nicht schon vorhanden:
									if( !video.src && video.canPlayType(conv_obj.type) ) {
										video.src = get_module_url( "get", {id : conv_obj.id, view : "data"} );
										$(video).data( {selected_variant_id: conv_obj.id} );
									}
									identification_request_list.push( conv_obj.id );
								} else {
									$(status_text).append( $('<div>').attr({class: 'video-status-warning'}).text(conv_obj.type+": processing") );
									stale_source_count++;
								}
							} else if( conv_obj.type.match('^image/.*') ) {
								if( conv_obj.size>0 ) {
									$(status_text).append( $('<div>').attr({class: 'video-status-success'}).text(conv_obj.type+": OK") );
									ready_source_count++;
									$(video).attr( {poster: get_module_url("get", {id : conv_obj.id, view : "data"})} );
									var poster_callback = $(video).closest(".entry-media").data("poster_callback");
									if( poster_callback ) {
										poster_callback( conv_obj );
									}
								} else {
									$(status_text).append( $('<div>').attr({class: 'video-status-warning'}).text(conv_obj.type+": processing") );
									stale_source_count++;
								}
							}
						}
					}
					GlobalRequestQueue.add( {
						module : "identify",
						args : {id : identification_request_list.join(",")},
						done : identification_callback
					});
					GlobalRequestQueue.process();
					
					// Original-Video-Daten als Fallback für unfertige/fehlgeschlagene Konvertierung:
					if( !video.src && video.canPlayType(obj.type) ) {
						video.src = get_module_url( "get", {id : obj.id, view : "data"} );
					}
					
					if( ready_source_count+stale_source_count==0 ) {
						// ggf. länger dauernde Anforderung für u.U. fehlende Konvertierungen:
						GlobalRequestQueue.add( {
							module : "convert",
							args : {mode : "convert", id : obj.id, view : "all"},
							done : conversion_callback
						}, "long" );
						GlobalRequestQueue.process();
					} else if( stale_source_count==0 ) {
						$(status).hide();
					}
					if( !video.src ) {
						setTimeout( function() {
							// Schnell-Lookup von bereits vorhandenen Konvertierungen wiederholen:
							GlobalRequestQueue.add( {
								module : "convert",
								args : {mode : "status", id : obj.id, view : "all"},
								done : conversion_callback
							} );
							GlobalRequestQueue.process();
						}, 5000 );
					}
					video.addEventListener( 'canplay', function(event) {
						$(status).hide();
					} );
				}
			};
			// Schnell-Lookup von bereits vorhandenen Konvertierungen:
			GlobalRequestQueue.add( {
				module : "convert",
				args : {mode : "status", id : obj.id, view : "all"},
				done : conversion_callback
			} );
			GlobalRequestQueue.process();
			$(dom_parent).append( obj.dom_object );
		}
	} else if( obj.type && obj.type=="application/x-obj.tag" ) {
		if( dom_parent && obj.title ) {
			obj.dom_object = $('#entry-tag-template').clone().attr( {title: obj.title} ).removeAttr("id")[0];
			$(obj.dom_object).data( {obj: obj} );
			var tag_label_obj = $('.entry-tag-label', obj.dom_object)[0];
			var tag_label_limit = 30;
			var tag_label = obj.title.length<=20 ? obj.title : obj.title.substr(0,tag_label_limit-3)+"...";
			$(tag_label_obj).text( tag_label );
			$('.entry-tag-tool-filter-for', obj.dom_object)[0].onclick = function(ev) {
				global_search.entry.text( global_search.entry.text()+' tag:'+tag_label );
				global_search.search();
			};
			$('.entry-tag-tool-filter-exclude', obj.dom_object)[0].onclick = function(ev) {
				var search_phrase = global_search.entry.text();
				if( search_phrase=='' ) search_phrase = 'type:entry';
				global_search.entry.text( search_phrase+' --tag:'+tag_label );
				global_search.search();
			};
			var entry = $(dom_parent).closest('.ems-entry')[0];
			if( entry && $(entry).data("obj") ) {
				if( $(dom_parent).hasClass('entry-tags-search-result') ) {
					$(dom_parent).append( obj.dom_object );
					if( obj.permissions.indexOf("write")>=0 && $(entry).data("obj").permissions.indexOf("write")>=0 ) {
						$('.entry-tag-add', obj.dom_object).show();
					} else {
						$('.entry-tag-add', obj.dom_object).hide();
					}
					$('.entry-tag-remove', obj.dom_object).hide();
				} else {
					$(dom_parent).closest('.ems-entry').find('.entry-tags-content').append( obj.dom_object );
					$('.entry-tag-add', obj.dom_object).hide();
					if( obj.permissions.indexOf("write")>=0 && $(entry).data("obj").permissions.indexOf("write")>=0 ) {
						$('.entry-tag-remove', obj.dom_object).show();
					} else {
						$('.entry-tag-remove', obj.dom_object).hide();
					}
				}
			}
			obj.dom_object.style.display="";
		}
	} else if ( obj.type && obj.type=="application/x-obj.publication" ) {
		if( dom_parent ) {
			obj.dom_object = $(dom_parent).closest('.ems-entry').find('.entry-publication')[0];
			$(obj.dom_object).addClass('entry-publication-active');
			$(obj.dom_object).data( {obj: obj} );
			var pub_link_obj = $('.entry-publication-link', obj.dom_object)[0];
			var entry_id = $(dom_parent).closest('.ems-entry').data("obj").id;
			var url = get_tpl_url("overview.html")+"&id="+String(entry_id)+"&sid="+obj.data;
			$(pub_link_obj).attr( {href: url} );
			$(pub_link_obj).click( function() {
				show_message( "Dieser Link würde dich ausloggen. Kopiere ihn daher über das Rechtslick-Menü oder gleich hier:" );
				show_error( url );
				return false;
			});
		}
	} else if( dom_parent && obj.id ) {
		var download_link = create_download( obj );
		$(dom_parent).append( download_link );
	}
	
	if( obj && obj.dom_object && parms.custom_class ) {
		$(obj.dom_object).addClass( parms.custom_class );
	}
}

function filter_user_content( button, mode ) {
	var user_element = $(button).closest('.ems-user')[0];
	var user_nick = $(user_element).data().obj.nick;
	var search_phrase = global_search.entry.text();
	if( mode=='for' ) {
		if( search_phrase.length ) search_phrase += ' ';
		search_phrase += 'user:'+user_nick;
	} else {
		if( !search_phrase.length ) search_phrase += 'type:entry';
		search_phrase += ' --user:'+user_nick;
	}
	global_search.entry.text( search_phrase );
	global_search.search();
}

var offsets_loaded = {};
var filters = { ids:{}, child_ids:{}, parent_ids:{} };

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
		
		$('.entry-media', content).each( function(i, element) {
			new UploadDialog( {replace_content: element} );
		});
	}
	
	// Standard-Toolbox verbergen und Editieren-Toolbox anzeigen:
	var std_tools = $( ".entry-tools", entry )[0];
	$(std_tools.style).hide();
	var edit_tools = $( ".entry-edit-tools", entry )[0];
	//$(edit_tools).show();
	$(edit_tools).css( {display:'inline-block'} );
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
		var token_list = element.textContent.match( /https?:\/\/[^ ]+|./gim );
		token_list = token_list ? token_list : [];
		var current_plain_text = "";
		var finalize_plain_text = function( plain_text ) {
			var obj = { 'type': 'text/plain', 'data': plain_text };
			if( text_obj && text_obj.unassigned ) {
				obj.id = Number(text_obj.id);
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
		}
		for( var i=0; i<token_list.length; i++ ) {
			if( token_list[i].length==1 ) {
				current_plain_text += token_list[i];
			} else if( token_list[i].length>1 ) {
				if( current_plain_text.length) {
					finalize_plain_text( current_plain_text );
					current_plain_text = "";
				}
				var obj = { 'type': 'text/html', 'data': $('<a>').attr({target:"_blank", href:token_list[i]}).text(token_list[i])[0].outerHTML };
				current_list.push( obj );
			}
		}
		if( current_plain_text.length) {
			finalize_plain_text( current_plain_text );
		}
	} else if( element.nodeName=="BR" || element.nodeName=="A" ) {
		if( $(element).data().obj ) {
			if( $(element).data().obj.data != element.outerHTML ) {
				$(element).data().obj.data = element.outerHTML;
				$(element).data().obj.changed = true;
			}
			current_list.push( $(element).data().obj );
		} else {
			var obj = { 'type': 'text/html', 'data': element.outerHTML };
			current_list.push( obj );
		}
	} else if( $(element).data().obj && $(element).data().obj.type!="text/plain" ) {
		// bestehende text/plain-Objekte werden beim Baumdurchlauf dem erst besten 
		// Text-Node zugewiesen und nicht, wie andere Objekte direkt hier übernommen...
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

/* FIXME: save_entry führt zur Reihenfolgeerhaltung der Abläufe Speichern/Löschen mehrere synchrone AJAX-Requests aus 
 *        und sollte daher nur in asynchronen Handlern aufgerufen werden! 
 *        Eventuell wär es sinnvoll die Funktion umzubenennen in save_entry_sync und einen Wrapper save_entry zu definieren,
 *        für einfache Fälle ohne Notwendigkeit der Reihenfolgeerhaltung mehrerer save_entry_sync-Aufrufe. */
function save_entry( button ) {
	var entry = $(button).closest(".ems-entry")[0];
	var upload_dialog = $( ".upload-dialog", entry );
	upload_dialog.each( function(i, element) {
		if( element && $(element).data && $(element).data("upload_dialog") ) {
			$(element).data("upload_dialog").confirm_upload();
		}
	} );
	
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
		post_module( "store", {
			args : {id : String(entry_id)},
			data : { title: title_text },
			async : false
		});
	}
	var content = $( ".entry-content", entry )[0];
	if( content ) {
		content.contentEditable = false
		var content_list = get_object_list( content );
		// Themen des Beitrages zurück kopieren:
		var edit_tools = $( ".entry-edit-tools", entry )[0];
		var std_tools = $( ".entry-tools", entry )[0];
		$(".entry-tags",std_tools).empty().append( $(".entry-tags",edit_tools).clone(true,true).contents() );
		$(".entry-tags",edit_tools).empty();
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
				post_module( "store", {
					args : {type : obj.type, parent_id : String(entry_id), sequence : String(i)},
					data : { data: obj.data },
					async : false, /* hier, ohne komplizierteres Event-Handling, wichtig zur Vermeidung von Race-Conditions */
					done : function( result ) {
						result = parse_result( result )
						if( result.succeeded ) {
							part_id_list.push( result.id )
						}
					}
				});
			} else if( obj.id && (obj.unassigned==undefined || obj.unassigned==true || obj.changed==true) ) {
				// bereits gespeicherte oder lokal geänderte Objekte, mit bestehender ID-Zuordnung, 
				// die dem Eintrag in korrekter Sequenz (neu) zugewiesen oder gespeichert werden müssen:
				get_module( "store", {
					args : {id : obj.id, parent_id : String(entry_id), sequence : String(i)},
					type : obj.changed ? "POST" : "GET",
					data : obj.changed ? { data: obj.data } : undefined,
					async : false, /* hier, ohne komplizierteres Event-Handling, wichtig zur Vermeidung von Race-Conditions */
					done : function( result ) {
						result = parse_result( result )
						if( result.succeeded ) {
							part_id_list.push( result.id )
						}
					}
				});
			}
		}
		// serverseitige Bereinigung alter Daten:
		// (Damit das so funktioniert, ist es wichtig, dass der Neuzuordnungsfall bestehender Objekte (2. Fall oben)
		//  eine Duplikatbehandlung der Eltern-Kind-Beziehungen vornimmt, sodass bestehende Zuordnungen aktualisiert
		//  (Sequenz) und nicht vermehrt werden...)
		get_module( "delete", {
			args : {parent_id : String(entry_id), child_not_in : part_id_list.join(",")},
			async : false,
			done : function( result ) {
				result = parse_result( result )
			}
		});
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
	var new_entry = $("#ems-entry-template").first().clone().removeAttr("id")[0];
	$(new_entry).data( {obj : {type : 'application/x-obj.entry', permissions : ["read","write"]}} );
	if( reference_item ) {
		$(reference_item).before( new_entry );
	} else {
		$(".ems-content").first().prepend( new_entry );
	}
	$(new_entry).wrap( '<div class="ems-item"></div>' )
	if( reference_item ) {
		// Antworttitel aus Titel des Referenzbeitrages generieren:
		reference_title = $(".entry-title", reference_item).first().text();
		if( !reference_title.match(/^Re:/i) ) {
			reference_title = "Re: "+reference_title;
		}
		$(".entry-title", new_entry).text( reference_title );
		// Themen des Referenzbeitrages kopieren:
		var ref_tags = $( ".entry-tags-content", reference_item )[0];
		var new_tags = $( ".entry-tags-content", new_entry )[0];
		$(new_tags).empty().append( $(ref_tags).clone(true,true).contents() );
	}
	new_entry.style.display="";
	var entry_author = $( ".entry-author", new_entry )[0];
	user_element = new_item( {obj:user, duplicates: true, dom_parent: entry_author} );
	if( user_element && user.avatar_id ) {
		replace_user_image( user_element, user.avatar_id );
	}
	edit_entry( new_entry );
}

function delete_entry( button ) {
	var entry = $(button).closest(".ems-entry")[0];
	Confirm.confirm( {message: 'Diesen Eintrag wirklich löschen?', before: $('.entry-tools',entry).first(),
		ok_parms: {entry: entry}, ok_callback: function( parms ) {
			var entry = parms.entry;
			get_module( "delete", {
				args : {id : String($(entry).data().obj.id)},
				done : function( result ) {
					result = parse_result( result );
					if( result.succeeded ) {
						var item = $(entry).closest(".ems-item").remove();
					}
				}
			});
		}
	});
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

function show_tag_selection( button ) {
	$(button).hide();
	var entry_tools = $(button).closest(".entry-tools")[0];
	var entry_tags = $(button).closest(".entry-tags")[0];
	var tags_selection = $(".entry-tags-selection", entry_tags)[0];
	var tags_searchbar = $(".entry-tags-searchbar", entry_tags)[0];
	var tags_search_result = $(".entry-tags-search-result", entry_tags)[0];
	var tags_search_result_scroll_container_hack = $(".entry-tags-search-result-scroll-container-hack", entry_tags)[0];
	var tags_content = $(".entry-tags-content", entry_tags)[0];
	
	// Suchtool für Tags initialisieren:
	var range_scroll_loader = null;
	var tag_search = new SearchBar( {
		entry_parent : $(tags_searchbar),
		result_handler : function( result ) {
			var first_range = false;
			if( $(tags_search_result).children().length==0 ) {
				first_range = true;
				var current_search = tag_search.entry.text().replace(/^\s*|\s*$/g,"");
				if( current_search.length > 0 ) {
					var current_search_found = false;
					for( var i=0; i<result.hitlist.length; i++ ) {
						var obj = result.hitlist[i];
						if( obj.title && obj.title.toLowerCase()==current_search.toLowerCase() ) {
							current_search_found = true;
						}
					}
					if( !current_search_found ) {
						show_object( {
							obj : {
								type : 'application/x-obj.tag', 
								title : current_search,
								permissions : ["read","write"]
							},
							dom_parent : tags_search_result,
							custom_class : 'entry-tag-new'
						} );
					}
				}
			}
			result.dom_parent = tags_search_result;
			show_search_result( result );
			if( first_range ) {
				// Falls tags_search_result initial leer war, müssen wir den Scroll-Container hier
				// mit der Render-Höhe der ersten Ergebnis-Range initialiseren: 
				// HACK: Der Ergebniscontainer ist ein in der Höhe unlimitiertes DIV in einem
				//   unsichtbaren Scroll-Container, der breit genug ist, um seitlich überlappende
				//   Zusatzwerkzeuge beinhalten zu können. Diese würden sonst beschnitten, da
				//   CSS derzeit nicht erlaubt overflow-y: scroll und overflow-X: visible zu
				//   kombinieren. Letzterer Wert wird zu auto (hidden oder scroll) geändert.
				$(tags_search_result).width( $(tags_search_result).width() );
				$(tags_search_result).css( {position : 'relative', left : '300px'} );
				$(tags_search_result_scroll_container_hack).css( {
					'overflow-y' : 'scroll', 
					'overflow-x' : 'hidden', 
					'margin-left' : '-300px',
					'margin-right' : '-20px'
				} );
				$(tags_search_result_scroll_container_hack).height( Math.max(100,$(tags_search_result).height()*0.9) );
				range_scroll_loader.range_start = result.hitlist.length;
				range_scroll_loader.scroll_handler_parms = { search_count : tag_search.search_count };
				range_scroll_loader.start();
			}
		},
		result_types : 'application/x-obj.tag',
		empty_search : {phrase : 'type:tag', min_weight : "None"},
		order_by : 'mtime',
		order_reverse : 'true',
		range_limit : 10,
		new_search_handler : function( parms ) {
			$(tags_search_result).empty();
			$(tags_search_result_scroll_container_hack).show();
			if( range_scroll_loader ) range_scroll_loader.stop();
			range_scroll_loader = new RangeScrollLoader( {
				scroll_container : tags_search_result_scroll_container_hack,
				scroll_handler : tag_search.search,
				scroll_condition : "element_scroll_condition"
			} );
		},
		on_ready : function() {
			$(tags_selection).show();
			tag_search.entry.outerWidth( $(tags_selection).innerWidth()*0.95 );
			tag_search.entry.focus();
			tag_search.search();
		}
	} );
}

function hide_tag_selection( button ) {
	var entry_tags = $(button).closest(".entry-tags")[0];
	$('.entry-tags-show-selection-button', entry_tags).show();
	$(".entry-tags-selection", entry_tags).hide();
	$(".entry-tags-search-result-scroll-container-hack", entry_tags).hide();
	$(".entry-tags-search-result", entry_tags).empty();
}

function add_tag( button ) {
	var entry = $(button).closest(".ems-entry")[0];
	var entry_id = $(entry).data().obj ? $(entry).data().obj.id : undefined;
	var tag = $(button).closest('.entry-tag')[0];
	tag = tag ? tag : button;
	var tag_id = $(tag).data().obj.id;
	var tags_selection = $(button).closest('.entry-tags-selection')[0];
	var tags_content = $('.entry-edit-tools .entry-tags-content',entry)[0];
	var get_args = { parent_id : String(5) };
	if( entry_id ) get_args.parent_id += ","+String(entry_id);
	if( tag_id ) {
		get_args["id"] = String(tag_id);
	} else {
		get_args["title"] = $(tag).data().obj.title;
		get_args["type"] = $(tag).data().obj.type;
	}
	get_module( "store", {
		args : get_args,
		done : function( result ) {
			result = parse_result( result );
			if( result.succeeded ) {
				tag_id = Number(result.id);
				hide_tag_selection( button );
				if( entry_id ) {
					// Daten neu laden, um Änderungen zu übernehmen:
					get_module( "get", {
						args : {id : entry_id, view : "all", recursive : true},
						done : function( result ) {
							result = parse_result( result );
							if( result.length ) {
								obj = result[0];
								$(".entry-content", entry).empty()
								$(".entry-tags-content", entry).empty()
								show_object( {dom_parent: entry, obj: obj, update: true} );
							}
						}
					});
				} else {
					show_object( {dom_parent: tags_content, obj: {id: tag_id}} );
				}
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
	var tags_content = $(button).closest('.entry-tags-content')[0];
	get_module( "delete", {
		args : {parent_id : entry_id, id : tag_id},
		done : function( result ) {
			result = parse_result( result );
			if( result.succeeded ) {
				$(tag).remove();
			}
		}
	});
}

function link_external( button, recursive ) {
	var entry = $(button).closest(".ems-entry")[0];
	var entry_id = $(entry).data().obj.id;
	get_module( "get", {
		args : {type : 'application/x-obj.publication', parent_id : entry_id},
		done : function( result ) {
			result = parse_result( result );
			if( result.length ) {
				var pub = result[0];
				show_object( {dom_parent: entry, obj: pub, update: true} );
				$( ".entry-publication-link", entry ).wrap( $("<div>").addClass("highlight") );
			} else if( !recursive ) {
				get_module( "store", {
					args : {type : 'application/x-obj.publication', parent_id : entry_id},
					done : function( result ) {
						result = parse_result( result );
						if( result.succeeded ) {
							link_external( button, /*recursive=*/true );
						}
					}
				});
			} else {
				show_message( "Externer Link konnte nicht erstellt werden" );
			}
		}
	});
}
