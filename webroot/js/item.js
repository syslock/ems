// FIXME: module encapsulation:
var BaseItem = null;

define( ["jquery"], function($) {
BaseItem = function( parms ) {
	var my = this;
	my.obj = parms.obj;
	my.short_type = my.get_short_type()
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

BaseItem.prototype.get_short_type = function( type ) {
	var my = this;
	var _type = type ? type : my.obj.type;
	return _type.match(/.*\.([^.]*)/)[1];
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

return BaseItem;
}); //define()

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

function show_object( parms ){
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
					show_object( {obj:obj.children[i], dom_parent:$("."+item.get_short_type()+"-content",item.dom_object)[0], limit:limit, update:update, parent:item} )
				}
			}
		}});
	} else if( obj.type == "application/x-obj.minion" ) {
		new BaseItem( {obj:obj, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates, prepend:prepend, update:update, ready: function(item) {
			var minion = new Minion( {dom_object: item.dom_object, obj:obj} );
			minion.parent = parent;
			if( dom_parent ) {
				for( var i in obj.children ) {
					show_object( {obj:obj.children[i], dom_parent:$("."+item.get_short_type()+"-content",item.dom_object)[0], limit:limit, update:update, parent:item} )
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
					show_object( {obj:obj.children[i], dom_parent:$("."+item.get_short_type()+"-content",item.dom_object)[0], limit:limit, update:update, parent:item} )
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
			obj.dom_object = $( "<div></div>" ).attr( {'class':'entry-html'} ).html( obj.data )[0];
			$(obj.dom_object).data( {obj: obj} );
			$(dom_parent).append( obj.dom_object );
			for( var i in obj.children ) {
				var child = obj.children[i];
				var objref = $( '.objref[oid='+String(child.id)+']', obj.dom_object )[0];
				show_object( {obj:obj.children[i], dom_parent:(objref ? objref : obj.dom_object), limit:limit, update:update, parent:obj/*FIXME: should be instance of BaseItem*/} )
			}
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
