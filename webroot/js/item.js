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
	
	my.init( parms );
}

// The sort_type is used to select and populate child elements in the dom sub tree 
// that is the objects visual representation and is defined by the visualization 
// template. The dom sub tree may also contain child elements representing objects 
// of different types, already populated into the tree. The short_type therefore 
// should by unique within the range of different objects living in the tree.
// FIXME: Maybe the short_type should not be guessed from the objects media_type.
// Earlier an object types template was fixed and had to be embedded by the main 
// view. In newer generation code the template is loaded dynamically by the objects 
// visualization module. It should be in the responsibility of that visualization
// module to populate the sub tree or provide API to access standard elements.
BaseItem.prototype.get_short_type = function( type ) {
	var my = this;
	var _type = type ? type : my.obj.type;
	return _type.match(/.*\/(.*\.)?([^.]*)/)[2];
}

BaseItem.prototype.init = function( parms ) {
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
		if( my.obj.id && !my.duplicates ) {
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
	
	my.update_standard_fields();
	
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

BaseItem.prototype.update_standard_fields = function() {
	var my = this;
	for( field_name in {"title":1, "nick":1, "name":1, "ctime":1, "mtime":1} ) {
		var value = my.obj[ field_name ];
		if( value!=undefined ) {
			if( field_name in {"ctime":1, "mtime":1} ) {
				var date_and_time = prettyprint_date_and_time( value );
				$( "."+my.short_type+"-"+field_name+"-day", my.dom_object ).first().text( date_and_time.date );
				$( "."+my.short_type+"-"+field_name+"-time", my.dom_object ).first().text( date_and_time.time );
			} else {
				$( "."+my.short_type+"-"+field_name, my.dom_object ).first().text( value );
			}
		}
	}
	if( my.obj.ctime && my.obj.mtime && Math.round(my.obj.ctime/60)==Math.round(my.obj.mtime/60) ) {
		$( "."+my.short_type+"-mtime", my.dom_object ).first().hide();
	}
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
		class: 'ems-item download-link', download: prettyprint_title(obj)
	}).append( $('<img />').attr({ 
		src: 'tango-scalable/actions/go-down.svg', 
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
	} else if( obj.type && obj.type == "application/x-obj.draft" ) {
		var parent_entry = null;
		var parent_user = null;
		for( i in obj.parents ) {
			if( obj.parents[i].type == "application/x-obj.entry" ) {
				parent_entry = obj.parents[i];
			}
		}
		if( !parent && !parent_entry ) {
			// Display owned drafts not belonging to entries as standalone objects:
			if( $.inArray("write",obj.permissions) != -1 ) {
				new Draft( {obj:obj, dom_parent:dom_parent, dom_child:dom_child, duplicates:duplicates, prepend:prepend, update:update} );
			}
		} else if( parent ) {
			// Display draft availability notification for drafts belonging to entries:
			obj.dom_object = $(parent.dom_object).find('.entry-draft-notification')[0];
			$(obj.dom_object).addClass('entry-status-notification-active');
			$(obj.dom_object).data( {obj: obj} );
			var date_and_time = prettyprint_date_and_time( obj.mtime );
			$(obj.dom_object).attr( {"title" : date_and_time.date+" "+date_and_time.time} );
			// Need to query explictly for a parent user as the reverse path is probably not available:
			get_module( "get", {
				"args" : { "child_id" : obj.id },
				"done" : function( result ) {
					result = parse_result( result );
					for( i in result ) {
						var parent_obj = result[i];
						if( parent_obj.type == "application/x-obj.user" && parent_obj.avatar_id ) {
							replace_user_image( obj.dom_object, parent_obj.avatar_id );
							$(obj.dom_object).attr( {"title" : parent_obj.nick+" "+$(obj.dom_object).attr("title")} );
						}
					}
				}
			});
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
			obj.dom_object = $( "<div></div>" ).attr( {'class':'entry-html'} ).html( obj.data )[0];
			$(obj.dom_object).data( {obj: obj} );
			$(dom_parent).append( obj.dom_object );
			for( var i in obj.children ) {
				var child = obj.children[i];
				var objref = $( '.objref[oid='+String(child.id)+']', obj.dom_object )[0];
				$(objref).attr( {'contentEditable': false} );
				show_object( {obj:obj.children[i], dom_parent:(objref ? objref : obj.dom_object), limit:limit, update:update, parent:obj/*FIXME: should be instance of BaseItem*/} )
			}
		}
	} else if( obj.type && obj.type.match(/^image\//) && obj.id ) {
		if( dom_parent ) {
			new ImageItem( {obj:obj, dom_parent:dom_parent, duplicates:true, parent:parent} );
		}
	} else if( obj.type && obj.type.match(/^video\//) && obj.id ) {
		if( dom_parent ) {
			new VideoItem( {obj:obj, dom_parent:dom_parent, duplicates:true, parent:parent} );
		}
	} else if( obj.type && obj.type=="application/x-obj.tag" ) {
		if( dom_parent && obj.title ) {
			new EntryTag( {obj:obj, dom_parent:dom_parent, duplicates:true, parent:parent} );
		}
	} else if ( obj.type && obj.type=="application/x-obj.publication" ) {
		if( parent ) {
			obj.dom_object = $(parent.dom_object).find('.entry-publication-notification')[0];
			$(obj.dom_object).addClass('entry-status-notification-active');
			$(obj.dom_object).data( {obj: obj} );
			var pub_link_obj = $('.entry-publication-link', obj.dom_object)[0];
			var entry_id = parent.obj.id;
			var url = get_tpl_url("blog.html")+"&id="+String(entry_id)+"&sid="+obj.data;
			$(pub_link_obj).attr( {href: url} );
			$(pub_link_obj).click( function() {
				show_message( "Dieser Link würde dich ausloggen. Kopiere ihn daher über das Rechtslick-Menü oder gleich hier:" );
				show_error( url );
				return false;
			});
			$(parent.dom_object).find('.entry-link-button').hide();
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
		search_phrase = 'user:"'+user_nick+'"';
	} else {
		if( !search_phrase.length ) search_phrase += 'type:entry';
		search_phrase += ' --user:"'+user_nick+'"';
	}
	global_search.entry.text( search_phrase );
	global_search.search();
}
