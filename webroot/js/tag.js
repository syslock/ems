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
