function get_short_type( type ) {
	return type.match(/.*\.([^.]*)/)[1]
}


function BaseItem( parms ) {
	var my = this;
	my.obj = parms.obj;
	my.short_type = get_short_type( my.obj.type )
	my.dom_object = parms.dom_object;
	my.dom_parent = parms.dom_parent;
	my.dom_child = parms.dom_child;
	my.update = parms.update;
	my.duplicates = parms.duplicates;
	my.prepend = parms.prepend;
	my.ready = parms.ready ? parms.ready : function(item){};
	my.parent = parms.parent;
	my.virtual = parms.virtual ? parms.virtual : false;
	my.custom_class = parms.custom_class;
	
	my.init();
}

BaseItem.prototype.init = function() {
	var my = this;
	if( my.obj.id==undefined && !my.virtual ) {
		my.store( { callback: function(){my.init();} } );
	} else if( !my.dom_object ) {
		// Neues Element im Browser anlegen:
		my.display();
		my.ready( my );
	} else {
		$(my.dom_object).data( {obj: my.obj} );
		my.ready( my );
	}
	if( my.obj && my.dom_object && my.custom_class ) {
		$(my.dom_object).addClass( my.custom_class );
	}
};

BaseItem.prototype.store = function( parms ) {
	var my = this;
	var get_args = {}
	if( my.obj.id ) {
		// Bestehende Objekt-ID für Update nutzen:
		get_args["id"] = my.obj.id;
	} else {
		// Neues, typisiertes Objekt auf dem Server anlegen:
		get_args["type"] = my.obj.type;
	}
	// optionale Zusatzparameter:
	if( my.obj.title ) get_args["title"]=my.obj.title;
	if( my.obj.nick ) get_args["nick"]=my.obj.nick;
	if( my.obj.name ) get_args["name"]=my.obj.name;
	get_module( 'store', {
		args : get_args,
		done : function( result ) {
			result = parse_result( result );
			if( result.succeeded && result.id!=undefined ) {
				my.obj.id = Number(result.id);
				my.virtual = false;
				if( parms && parms.callback ) {
					parms.callback();
				}
			}
		}
	});
};

BaseItem.prototype.display = function() {
	var my = this;
	var item = my.dom_object;
	if( !item && my.update ) {
		if( my.dom_parent ) {
			item = $(".ems-"+my.short_type, my.dom_parent)[0]
		} else if( my.dom_child ) {
			item = $(my.dom_child).closest(".ems-"+my.short_type)[0]
		}
	}
	if( !item && !my.duplicates ) {
		item = $("#ems-"+my.short_type+"-"+String(my.obj.id))[0]
	}
	if( !item ) {
		item = $('<div class="ems-item"></div>')[0];
		if( my.template ) {
			$(item).html( my.template );
		} else {
			$(item).append( $("#ems-"+my.short_type+"-template").first().clone().attr({"id":""}).css({"display":""}) );
		}
		if( my.obj.id ) {
			item.id = "ems-"+my.short_type+"-"+String(my.obj.id);
		}
		if( my.dom_parent ) {
			if( my.prepend ) {
				$(my.dom_parent).first().prepend( item );
			} else {
				$(my.dom_parent).first().append( item );
			}
		} else if( my.dom_child ) {
			$(my.dom_child).first().before( item );
			$("."+my.short_type+"-content",item).append( my.dom_child );
		}
		$(item).data( {obj: my.obj} );
		// FIXME: Früher haben wir data für das jeweilige Template-Root-Element und nicht ems-items gesetzt!
		//        Welche Probleme werden dadurch verursacht? 
		//        Sollten wir data als Hack auch für das erste Kind-Element setzen?
		//$(item.children[0]).data( {obj: my.obj} );
	}
	if( my.dom_object!=item ) my.dom_object = item;
	if( my.obj.dom_object!=item ) my.obj.dom_object = item;
	for( field_name in {"title":1, "nick":1, "name":1, "ctime":1, "mtime":1} ) {
		var value = my.obj[ field_name ];
		if( value!=undefined ) {
			if( field_name in {"ctime":1, "mtime":1} ) {
				var date = new Date(value*1000);
				var day = date.getDate()+"."+(date.getMonth()+1)+"."+date.getFullYear()
				var hours = date.getHours();
				hours = (hours<10) ? "0"+String(hours) : String(hours);
				var minutes = date.getMinutes();
				minutes = (minutes<10) ? "0"+String(minutes) : String(minutes);
				var time = hours+":"+minutes;
				$( "."+my.short_type+"-"+field_name+"-day", item ).first().text( day );
				$( "."+my.short_type+"-"+field_name+"-time", item ).first().text( time );
			} else {
				$( "."+my.short_type+"-"+field_name, item ).first().text( value );
			}
		}
	}
	if( my.obj.ctime && my.obj.mtime && Math.round(my.obj.ctime/60)==Math.round(my.obj.mtime/60) ) {
		$( "."+my.short_type+"-mtime", item ).first().hide();
	}
	for( permission in {"read":1,"write":1,"delete":1,"insert":1} ) {
		// show/hide child elements depending on permission markers related to the object:
		if( $.inArray(permission, my.obj.permissions)==-1 ) {
			$( ".require-permission-"+permission+"-"+my.short_type, item ).hide();
		} else {
			$( ".require-permission-"+permission+"-"+my.short_type, item ).show();
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

function show_search_result( parms ) {
	var dom_parent = (parms.dom_parent ? parms.dom_parent : $(".ems-content")[0]);
	for( i in parms.hitlist ) {
		show_object( {obj: parms.hitlist[i], dom_parent: dom_parent, limit: parms.limit, parent: parms.parent} )
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
	var parent = parms.parent;
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
		new BaseItem( {obj:obj, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates, prepend:prepend, update:update, ready: function(item) {
			item.parent = parent;
			if( dom_parent ) {
				for( var i in obj.children ) {
					show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item.dom_object)[0], limit:limit, update:update, parent:item} )
				}
			}
		}});
	} else if( obj.type == "application/x-obj.minion" ) {
		new BaseItem( {obj:obj, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates, prepend:prepend, update:update, ready: function(item) {
			var minion = new Minion( {dom_object: item.dom_object, obj:obj} );
			minion.parent = parent;
			if( dom_parent ) {
				for( var i in obj.children ) {
					show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item.dom_object)[0], limit:limit, update:update, parent:item} )
				}
			}
		}});
	} else if( obj.type == "application/x-obj.user" ) {
		new BaseItem( {obj:obj, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates, prepend:prepend, update:update, ready: function(item) {
			item.parent = parent;
			if( obj.avatar_id ) {
				replace_user_image( item.dom_object, obj.avatar_id );
			}
			if( dom_parent ) {
				/*for( var i in obj.children ) {
					show_object( {obj:obj.children[i], dom_parent:$("."+get_short_type(obj.type)+"-content",item.dom_object)[0], limit:limit, update:update, parent:item} )
				}*/
			}
		}});
	} else if( obj.type == "application/x-obj.entry" ) {
		new Entry( {obj:obj, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates, prepend:prepend, update:update} );
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
			new EntryTag( {obj:obj, dom_parent:dom_parent, duplicates:true, parent:parent} );
		}
	} else if ( obj.type && obj.type=="application/x-obj.publication" ) {
		if( parent ) {
			obj.dom_object = $(parent.dom_object).find('.entry-publication')[0];
			$(obj.dom_object).addClass('entry-publication-active');
			$(obj.dom_object).data( {obj: obj} );
			var pub_link_obj = $('.entry-publication-link', obj.dom_object)[0];
			var entry_id = parent.obj.id;
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
}

function filter_user_content( button, mode ) {
	var user_element = $(button).closest('.ems-user')[0];
	var user_nick = $(user_element.parentNode).data().obj.nick;
	var search_phrase = global_search.entry.text();
	if( mode=='for' ) {
		search_phrase = 'user:'+user_nick;
	} else {
		if( !search_phrase.length ) search_phrase += 'type:entry';
		search_phrase += ' --user:'+user_nick;
	}
	global_search.entry.text( search_phrase );
	global_search.search();
}

var offsets_loaded = {};
var filters = { ids:{}, child_ids:{}, parent_ids:{} };


var Entry = function( parms ) {
	var my = this;
	parms = parms ? parms : {};
	parms.obj = parms.obj ? parms.obj : {};
	parms.obj.type = parms.obj.type ? parms.obj.type : "application/x-obj.entry";
	BaseItem.call( this, parms );
};
Entry.prototype = Object.create( BaseItem.prototype );
Entry.prototype.constructor = Entry;

Entry.prototype.init = function() {
	var my = this;
	if( my.template==undefined ) {
		// FIXME: We should try to do only one request for the template,
		//        even if a bunch of objects are initiated the same time,
		//        e.g. at initial page load.
		GlobalRequestQueue.add({
			module : "render",
			args : {tpl : "elements/entry.html"},
			done : function(result) {
				Entry.prototype.template = result;
				my.init();
			}, 
			fail : function(result) {
				show_error( result )
			}
		});
		GlobalRequestQueue.process();
	} else {
		BaseItem.prototype.init.call( this );
		my.entry = $( ".ems-entry", my.dom_object )[0];
		my.title = $( ".entry-title", my.entry )[0];
		my.content = $( ".entry-content", my.entry )[0];
		my.std_tools = $( ".entry-tools", my.entry )[0];
		my.std_tags = $( ".entry-tags", my.std_tools )[0];
		my.edit_tools = $( ".entry-edit-tools", my.entry )[0];
		my.edit_tags = $( ".entry-tags", my.edit_tools )[0];
		my.author = $('.entry-author', my.dom_object)[0];
		my.tags_selection = $(".entry-tags-selection", my.entry)[0];
		my.tags_searchbar = $(".entry-tags-searchbar", my.entry)[0];
		my.tags_search_result = $(".entry-tags-search-result", my.entry)[0];
		my.tags_search_result_scroll_container_hack = $(".entry-tags-search-result-scroll-container-hack", my.entry)[0];
		my.tags_content = $(".entry-tags-content", my.entry)[0];
		
		$(my.content).empty();
		$(my.author).empty();
		$(my.tags_content).empty();
		
		if( my.dom_parent ) {
			for( var i in my.obj.children ) {
				var dom_parent = my.content;
				var child = my.obj.children[i];
				if( child.type == "application/x-obj.tag" ) {
					dom_parent = my.tags_content;
				}
				show_object( {obj:my.obj.children[i], dom_parent:dom_parent, parent:my} )
			}
			var user_found = false;
			for( var i in my.obj.parents ) {
				var parent = my.obj.parents[i];
				if( parent.type == "application/x-obj.user" ) {
					user_found = true;
					show_object( {obj:parent, dom_parent:my.author, duplicates:true, parent:my} );
				}
			}
			if( !user_found ) {
				show_object( {obj:{id:3}, dom_parent:my.author, duplicates:true, parent:my} );
			}
		}
		
		my.button_show_tag_selection = $( ".entry-tags-show-selection-button", my.dom_object )[0];
		$(my.button_show_tag_selection).on( "click", function(){ my.show_tag_selection(); } );
		my.button_hide_tag_selection = $( ".entry-tags-close-selection-button", my.dom_object )[0];
		$(my.button_hide_tag_selection).on( "click", function(){ my.hide_tag_selection(); } );
		my.button_respond = $( ".entry-response-button", my.dom_object )[0];
		$(my.button_respond).on( "click", function(){ my.new_response(); } );
		my.button_link_external = $( ".entry-link-button", my.dom_object )[0];
		$(my.button_link_external).on( "click", function(){ my.link_external(); } );
		my.button_edit = $( ".entry-edit-button", my.dom_object )[0];
		$(my.button_edit).on( "click", function(){ my.edit(); } );
		my.button_delete = $( ".entry-delete-button", my.dom_object )[0];
		$(my.button_delete).on( "click", function(){ my.delete_entry(); } );
		my.button_file = $( ".entry-edit-file-button", my.dom_object )[0];
		$(my.button_file).on( "click", function() { new UploadDialog( {dom_parent: my.content, wrap: true} ); } );
		my.button_save = $( ".entry-edit-send-button", my.dom_object )[0];
		$(my.button_save).on( "click", function() { my.store(); } );
		my.button_discard = $( ".entry-edit-discard-button", my.dom_object )[0];
		$(my.button_discard).on( "click", function() { my.discard_response(); } );
	}
}

Entry.prototype.edit = function() {
	var my = this;
	$(my.entry).addClass("new-entry");
	
	if( my.title ) {
		my.title.contentEditable = true
		if( my.title.innerHTML.length==0 || !my.content ) my.title.focus()
	}
	if( my.content ) {
		my.content.contentEditable = true
		if( my.title.innerHTML.length>0 ) my.content.focus()
		
		$('.entry-media', my.content).each( function(i, element) {
			new UploadDialog( {replace_content: element} );
		});
	}
	
	// Themen des Beitrages vom Standardwerkzeug in das Bearbeitungswerkzeug verschieben:
	$(my.edit_tags).empty().append( $(my.std_tags).contents().detach() );
};

Entry.prototype.get_plain_text = function( element ) {
	var my = this;
	var current_plain_text = "";
	for( var i=0; i<element.childNodes.length; i++ ) {
		var child = element.childNodes[i];
		if( child.nodeName!="#text" ) {
			current_plain_text += my.get_plain_text( child );
			if( child.nodeName=="BR" || child.nodeName=="DIV" ) {
				current_plain_text += "\n";
			}
		}
		else current_plain_text += child.textContent;
	}
	return current_plain_text;
};

Entry.prototype.get_object_list = function( element, text_obj ) {
	var my = this;
	var current_list = [];
	if( element.nodeName=="#text" ) {
		// Text-Knoten werden mittels Regex in eine Liste von einzelnen Zeichen und HTTP(S)-URLs zerlegt
		var token_list = element.textContent.match( /https?:\/\/[^ ]+|./gim );
		token_list = token_list ? token_list : [];
		var current_plain_text = "";
		// finalize_plain_text speichert ein text/plain-Objekt mit den derzeit zwischengespeicherten, 
		// einzelnen Zeichen in der Ergebnisliste
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
				// Token der Länge 1 werden als Einzelzeichen interpretiert und dem Textpuffer hinzugefügt
				current_plain_text += token_list[i];
			} else if( token_list[i].length>1 ) {
				// Token mit Länge>1 werden als HTTP(S)-Links interpretiert, wobei zunächst der aktuelle Textpuffer
				// als text/plain-Objekt und anschließend der HTTP(S)-Link als text/html-Objekt in der Ergebnisliste
				// abgelegt werden
				if( current_plain_text.length) {
					finalize_plain_text( current_plain_text );
					current_plain_text = "";
				}
				var obj = { 'type': 'text/html', 'data': $('<a>').attr({target:"_blank", href:token_list[i]}).text(token_list[i])[0].outerHTML };
				current_list.push( obj );
			}
		}
		// Zuletzt werden die abschließenden Einzelzeichen als text/plain-Objekt zusammengefasst
		if( current_plain_text.length) {
			finalize_plain_text( current_plain_text );
		}
	} else if( element.nodeName=="BR" || element.nodeName=="A" ) {
		// BR- und A-Knoten werden als HTML-Quelltext in text/html-Objekten gespeichert oder aktualisiert
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
		// Bei anderen Knoten mit bestehender Objekt-Attributierung, wird diese in diese
		// in die Ergebnisliste übernommen. Bestehende text/plain-Objekte werden hier
		// ignoriert, da ihr Inhalt bei der Text-Knoten-Verarbeitung erfasst wird.
		current_list.push( $(element).data().obj );
	}
	if( !$(element).data().obj || $(element).data().obj.type=="text/plain" ) {
		// Knoten ohne Objekt-Attributierung und bestehende text/plain-Objekte werden durch
		// rekursiven Aufruf verarbeitet und das Verarbeitungsergbnis der Ergebnisliste angefügt.
		// Dabei wird ein bestehende text/plain-Objekt dem rekursiven Aufruf als primäres
		// Speicherziel für den Inhalt von TEXT-Knoten mitgegeben.
		if( $(element).data().obj && $(element).data().obj.type=="text/plain" ) {
			text_obj = $(element).data().obj;
			text_obj.unassigned = true;
		}
		for( var i=0; i<element.childNodes.length; i++ ) {
			var child = element.childNodes[i];
			current_list = current_list.concat( my.get_object_list(child, text_obj) );
		}
	}
	return current_list;
};

Entry.prototype.restore_standard_tools = function() {
	var my = this;
	// Themen vom Bearbeitungswerkzeug zurück in das Standardwerkzeug verschieben:
	$(my.std_tags).empty().append( $(my.edit_tags).contents().detach() );
};

Entry.prototype.remove_new_entry_item = function() {
	var my = this;
	// neues entry-Objekt und Pseudo-Item löschen:
	var item = $(my.entry).closest(".ems-item")[0];
	$(item).remove();
};

Entry.prototype.store = function() {
	var my = this;
	var upload_dialogs = $( ".upload-dialog", my.entry );
	upload_dialogs.each( function(i, element) {
		if( element && $(element).data && $(element).data("upload_dialog") ) {
			// FIXME: Wir sollten einen generischen Weg haben die JS-Objekte in den DOM-Elementen zu referenzieren.
			$(element).data("upload_dialog").confirm_upload();
		}
	});
	
	$(my.entry).removeClass("new-entry");
	var new_entry_created = false;
	if( !my.obj || !my.obj.id ) {
		// BaseItem.prototype.store() erledigt die eigentliche Speicherung
		new_entry_created = true;
	}
	if( my.title ) {
		my.title.contentEditable = false
		my.obj.title = my.get_plain_text( my.title )
	}
	BaseItem.prototype.store.call( my, {callback: function() {
		if( my.content ) {
			my.content.contentEditable = false
			var content_list = my.get_object_list( my.content );
			// Standard-Tools wiederherstellen und Themen des Beitrages dabei zurück kopieren:
			my.restore_standard_tools();
			if( my.tags_content ) {
				content_list = content_list.concat( my.get_object_list(my.tags_content) );
			}
			// Inhalt speichern:
			var part_id_list = []
			for( var i in content_list ) {
				var obj = content_list[i];
				if( obj.id==undefined && obj.type && obj.data ) {
					// neu zu speichernde Objekte mit Inhalt, ohne bestehende ID-Zuordnung:
					// (bisher nur text/plain)
					post_module( "store", {
						args : {type : obj.type, parent_id : String(my.obj.id), sequence : String(i)},
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
						args : {id : obj.id, parent_id : String(my.obj.id), sequence : String(i)},
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
				args : {parent_id : String(my.obj.id), child_not_in : part_id_list.join(",")},
				async : false,
				done : function( result ) {
					result = parse_result( result )
				}
			});
		}
		if( new_entry_created ) {
			// Neuen Beitrag vorn neu anfügen:
			my.remove_new_entry_item();
			show_object( {dom_parent: my.dom_parent, obj: {id: my.obj.id}, prepend: true} );
		}
	}});
};

Entry.prototype.new_response = function() {
	var my = this;
	var user = global_user; // FIXME: should not use globals
	var new_entry = new Entry( {virtual:true, obj:{parents:[user],permissions:['read','write']}, duplicates:true, dom_parent:my.dom_parent, prepend:true} );
	$(my.dom_object).before( $(new_entry.dom_object).detach() );
	// Antworttitel aus Titel des Referenzbeitrages generieren:
	var reference_title = $(my.title).text();
	if( !reference_title.match(/^Re:/i) ) {
		reference_title = "Re: "+reference_title;
	}
	$(new_entry.title).text( reference_title );
	// Themen des Referenzbeitrages kopieren:
	$(new_entry.tags_content).empty().append( $(my.tags_content).contents().clone(true,true) );
	var entry_author = $( ".entry-author", new_entry )[0];
	new_entry.edit();
};

Entry.prototype.delete_entry = function() {
	var my = this;
	Confirm.confirm( {message: 'Diesen Eintrag wirklich löschen?', before: $(my.std_tools).first(),
		ok_callback: function( parms ) {
			get_module( "delete", {
				args : {id : String(my.obj.id)},
				done : function( result ) {
					result = parse_result( result );
					if( result.succeeded ) {
						my.remove_new_entry_item();
					}
				}
			});
		}
	});
};

Entry.prototype.discard_response = function() {
	var my = this;
	$(my.entry).removeClass("new-entry");
	if( !my.obj || !my.obj.id ) {
		my.remove_new_entry_item();
	} else {
		my.restore_standard_tools();
		if( my.title ) {
			$(my.title).empty()
			my.title.contentEditable = false;
		}
		if( my.content ) {
			$(my.content).empty()
			my.content.contentEditable = false;
		}
		$(".entry-tags-content", my.entry).empty()
		// Daten neu laden, um lokale Änderungen zu beseitigen:
		show_object( {dom_parent: my.entry, obj: my.obj, update: true} );
	}
};

Entry.prototype.show_tag_selection = function() {
	var my = this;
	$(my.button_show_tag_selection).hide();
	
	// Suchtool für Tags initialisieren:
	var range_scroll_loader = null;
	var tag_search = new SearchBar( {
		entry_parent : $(my.tags_searchbar),
		result_handler : function( result ) {
			var first_range = false;
			if( $(my.tags_search_result).children().length==0 ) {
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
						new EntryTag( {
							obj : {
								type : 'application/x-obj.tag', 
								title : current_search,
								permissions : ["read","write"]
							},
							dom_parent : my.tags_search_result,
							custom_class : 'entry-tag-new',
							parent: my,
							virtual: true
						} );
					}
				}
			}
			result.dom_parent = my.tags_search_result;
			result.parent = my;
			show_search_result( result );
			if( first_range ) {
				// Falls tags_search_result initial leer war, müssen wir den Scroll-Container hier
				// mit der Render-Höhe der ersten Ergebnis-Range initialiseren: 
				// HACK: Der Ergebniscontainer ist ein in der Höhe unlimitiertes DIV in einem
				//   unsichtbaren Scroll-Container, der breit genug ist, um seitlich überlappende
				//   Zusatzwerkzeuge beinhalten zu können. Diese würden sonst beschnitten, da
				//   CSS derzeit nicht erlaubt overflow-y: scroll und overflow-X: visible zu
				//   kombinieren. Letzterer Wert wird zu auto (hidden oder scroll) geändert.
				$(my.tags_search_result).width( $(my.tags_search_result).width() );
				$(my.tags_search_result).css( {position : 'relative', left : '300px'} );
				$(my.tags_search_result_scroll_container_hack).css( {
					'overflow-y' : 'scroll', 
					'overflow-x' : 'hidden', 
					'margin-left' : '-300px',
					'margin-right' : '-20px'
				} );
				$(my.tags_search_result_scroll_container_hack).height( Math.max(100,$(my.tags_search_result).height()*0.9) );
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
			$(my.tags_search_result).empty();
			$(my.tags_search_result_scroll_container_hack).show();
			if( range_scroll_loader ) range_scroll_loader.stop();
			range_scroll_loader = new RangeScrollLoader( {
				scroll_container : my.tags_search_result_scroll_container_hack,
				scroll_handler : tag_search.search,
				scroll_condition : "element_scroll_condition"
			} );
		},
		on_ready : function() {
			$(my.tags_selection).show();
			tag_search.entry.outerWidth( $(my.tags_selection).innerWidth()*0.95 );
			tag_search.entry.focus();
			tag_search.search();
		}
	} );
};

Entry.prototype.hide_tag_selection = function() {
	var my = this;
	$(my.button_show_tag_selection).show();
	$(my.tags_selection).hide();
	$(my.tags_search_result_scroll_container_hack).hide();
	$(my.tags_search_result).empty();
};

Entry.prototype.link_external = function( button, recursive ) {
	var my = this;
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
};

var EntryTag = function( parms ) {
	var my = this;
	parms = parms ? parms : {};
	BaseItem.call( this, parms );
};
EntryTag.prototype = Object.create( BaseItem.prototype );
EntryTag.prototype.constructor = EntryTag;

EntryTag.prototype.init = function() {
	var my = this;
	if( my.template==undefined ) {
		// FIXME: We should try to do only one request for the template,
		//        even if a bunch of objects are initiated the same time,
		//        e.g. at initial page load.
		GlobalRequestQueue.add({
			module : "render",
			args : {tpl : "elements/entry-tag.html"},
			done : function(result) {
				EntryTag.prototype.template = result;
				my.init();
			}, 
			fail : function(result) {
				show_error( result )
			}
		});
		GlobalRequestQueue.process();
	} else {
		BaseItem.prototype.init.call( this );
		my.label = $( ".entry-tag-label", my.dom_object )[0];
		my.tools = $( ".entry-tag-tools", my.dom_object )[0];
		my.button_search = $( ".entry-tag-tool-filter-for", my.dom_object )[0];
		my.button_exclude = $( ".entry-tag-tool-filter-exclude", my.dom_object )[0];
		my.button_add = $( ".entry-tag-add", my.dom_object )[0];
		my.button_remove = $( ".entry-tag-remove", my.dom_object )[0];
		
		$(my.dom_object).attr( {title: my.obj.title} );
		var label_limit = 30;
		var label_text = my.obj.title.length<=label_limit-3 ? my.obj.title : my.obj.title.substr(0,label_limit-3)+"...";
		$(my.label).text( label_text );
		my.get_tag_search_query = function( label, modifier ) {
			modifier = modifier ? modifier : "";
			var parts = my.obj.title.match( /(\S+)/g );
			var tag_search_query = "";
			for( var i=0; i<parts.length; i++ ) {
				tag_search_query += (i>0 ? " " : "")+modifier+"tag:"+parts[i];
			}
			return tag_search_query;
		}
		$(my.button_search).on("click", function(ev) {
			global_search.entry.text( my.get_tag_search_query(my.obj.title) );
			global_search.search();
		});
		$(my.button_exclude).on("click", function(ev) {
			var search_phrase = global_search.entry.text();
			if( search_phrase=='' ) search_phrase = 'type:entry';
			global_search.entry.text( search_phrase+' '+my.get_tag_search_query(my.obj.title,"--") );
			global_search.search();
		});
		if( my.parent && my.parent.obj ) {
			if( $(my.dom_parent).hasClass('entry-tags-search-result') ) {
				$(my.button_remove).hide();
				if( my.obj.permissions.indexOf("write")>=0 && my.parent.obj.permissions.indexOf("write")>=0 ) {
					$(my.button_add).show();
				} else {
					$(my.button_add).hide();
				}
			} else {
				$(my.button_add).hide();
				if( my.obj.permissions.indexOf("write")>=0 && my.parent.obj.permissions.indexOf("write")>=0 ) {
					$(my.button_remove).show();
				} else {
					$(my.button_remove).hide();
				}
			}
		}
		
		my.button_add_tag = $(".entry-tag-add", my.dom_object)[0];
		$(my.button_add_tag).on( "click", function() { my.add_tag(); } );
		my.button_remove_tag = $(".entry-tag-remove", my.dom_object)[0];
		$(my.button_remove_tag).on( "click", function() { my.remove_tag(); } );
	}
};

EntryTag.prototype.add_tag = function() {
	var my = this;
	var get_args = { parent_id : String(5) };
	if( my.parent.obj.id ) {
		get_args.parent_id += ","+String(my.parent.obj.id);
	}
	if( my.obj && my.obj.id ) {
		get_args["id"] = String(my.obj.id);
	} else {
		get_args["title"] = my.obj.title;
		get_args["type"] = my.obj.type;
	}
	get_module( "store", {
		args : get_args,
		done : function( result ) {
			result = parse_result( result );
			if( result.succeeded ) {
				var tag_id = Number(result.id);
				my.parent.hide_tag_selection();
				// Daten neu laden, um Änderungen zu übernehmen:
				get_module( "get", {
					args : {id : tag_id, view : "all", recursive : false},
					done : function( result ) {
						result = parse_result( result );
						if( result.length ) {
							var obj = result[0];
							new EntryTag( {obj: obj, parent: my.parent, dom_parent: my.parent.tags_content} );
						}
					}
				});
			}
		}
	});
};

EntryTag.prototype.remove_tag = function() {
	var my = this;
	if( !my.parent || !my.parent.obj || !my.obj || !my.obj.id ) {
		$(my.dom_object).remove();
		return;
	}
	get_module( "delete", {
		args : {parent_id : my.parent.obj.id, id : my.obj.id},
		done : function( result ) {
			result = parse_result( result );
			if( result.succeeded ) {
				$(my.dom_object).remove();
			}
		}
	});
};

