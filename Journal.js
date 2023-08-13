/**
 * JournalManager (WIP)
 * Is the tab on the sidebar that allows you to write notes
 		* Requires journalPanel = new Sidebar();
		* All of its DOM elements attach to journalPanel tree 
 * Also holds notes attached to tokens
 * 
 */

class JournalManager{
	
	
	constructor(gameid){
		this.gameid=gameid;
		
		if (window.DM && (localStorage.getItem('Journal' + gameid) != null)) {
			this.notes = $.parseJSON(localStorage.getItem('Journal' + gameid));
		}
		else{
			this.notes={};
		}
		if (window.DM && (localStorage.getItem('JournalChapters' + gameid) != null)) {
			this.chapters = $.parseJSON(localStorage.getItem('JournalChapters' + gameid));
		}
		else{
			this.chapters=[];
		}
	}
	
	persist(){
		if(window.DM){
			localStorage.setItem('Journal' + this.gameid, JSON.stringify(this.notes));
			localStorage.setItem('JournalChapters' + this.gameid, JSON.stringify(this.chapters));
		}
	}
	
	
	
	sync(){
		let self=this;
		if(window.DM){
			window.MB.sendMessage('custom/myVTT/JournalChapters',{
				chapters: self.chapters
				});
			
			for(let i in self.notes){
				if(self.notes[i].player)
					window.MB.sendMessage('custom/myVTT/note',{
						id: i,
						note:self.notes[i]
					});
			}
		}
	}
	
	build_journal(){
		let self=this;

		journalPanel.body.empty();
		if (journalPanel.header.find(".panel-warning").length == 0) {
			journalPanel.header.append("<div class='panel-warning'>WARNING/WORKINPROGRESS THE JOURNAL IS CURRENTLY STORED IN YOUR BROWSER STORAGE. DON'T DELETE BROWSER HISTORY</div>");
		}
		
		const row_add_chapter=$("<div class='row-add-chapter'></div>");
		const input_add_chapter=$("<input type='text' placeholder='New chapter name' class='input-add-chapter'>");
		
		input_add_chapter.on('keypress',function(e){
			if (e.which==13 && input_add_chapter.val() !== ""){
				self.chapters.push({
					title: input_add_chapter.val(),
					collapsed: false,
					notes: [],
				});
				self.persist();
				self.build_journal();
				window.MB.sendMessage('custom/myVTT/JournalChapters',{
					chapters: self.chapters
				});
				$(this).val('');
			}
		});

		const btn_add_chapter=$("<button id='btn_add_chapter'>Add Chapter</button>");

		btn_add_chapter.click(function() {
			if (input_add_chapter.val() == "") {
				
				return;
			}

			self.chapters.push({
				title: input_add_chapter.val(),
				collapsed: false,
				notes: [],
			});
			self.persist();
			self.build_journal();
			window.MB.sendMessage('custom/myVTT/JournalChapters',{
				chapters: self.chapters
			});
		});
		
		if(window.DM) {
			row_add_chapter.append(input_add_chapter);
			row_add_chapter.append(btn_add_chapter);
			journalPanel.body.append(row_add_chapter);
		}
		
		// Create a chapter list that sorts journal-chapters with drag and drop
		const chapter_list=$(`<ul class='folder-item-list'></ul>`);
		chapter_list.sortable({
			items: '.folder',
			update: function(event, ui) {
				// Find the old index of the dragged element
				const old_index = self.chapters.findIndex(function(chapter) {
					return chapter.title == ui.item.find(".journal-chapter-title").text();
				});
				// Find the new index of the dragged element
				const new_index = ui.item.index();
				// Move the dragged element to the new index
				self.chapters.splice(new_index, 0, self.chapters.splice(old_index, 1)[0]);
				self.persist();
				window.MB.sendMessage('custom/myVTT/JournalChapters',{
					chapters: self.chapters
				});
				self.build_journal();
			}
		});

		journalPanel.body.append(chapter_list);

		for(let i=0; i<self.chapters.length;i++){
			console.log('xxx');
			// A chapter title can be clicked to expand/collapse the chapter notes
			let section_chapter=$(`
				<div data-index='${i}' class='sidebar-list-item-row list-item-identifier folder ${self.chapters[i]?.collapsed ? 'collapsed' : ''}'></div>
			`);

			// Create a sortale list of notes
			const note_list=$("<ul class='note-list'></ul>");

			var sender;
			// Make the section_chapter sortable
			section_chapter.sortable({
				connectWith: ".folder",
				items: '.sidebar-list-item-row',
		        receive: function(event, ui) {
		            // Called only in case B (with !!sender == true)
		            sender = ui.sender;
		           	let sender_index = sender.attr('data-index');
		           	let new_folder_index = ui.item.parent().closest('.folder').attr('data-index');
		          	const old_index = self.chapters[sender_index].notes.findIndex(function(note) {
						return note == ui.item.attr('data-id');
					});
					// Find the new index of the dragged element
					const new_index = ui.item.index();
					// Move the dragged element to the new index
					self.chapters[new_folder_index].notes.splice(new_index, 0, self.chapters[sender_index].notes.splice(old_index, 1)[0]);
					self.persist();
					window.MB.sendMessage('custom/myVTT/JournalChapters',{
						chapters: self.chapters
					});
					self.build_journal();
		            event.preventDefault();
		        },
				update: function(event, ui) {
					// Find the old index of the dragged element
					if(sender==undefined){
						const old_index = self.chapters[i].notes.findIndex(function(note) {
							return note == ui.item.attr('data-id')
						});
						// Find the new index of the dragged element
						const new_index = ui.item.index();
						// Move the dragged element to the new index
						self.chapters[i].notes.splice(new_index, 0, self.chapters[i].notes.splice(old_index, 1)[0]);
						self.persist();
						window.MB.sendMessage('custom/myVTT/JournalChapters',{
							chapters: self.chapters
						});
						self.build_journal();
					}

				}
			});
			let folderIcon = $(`<div class="sidebar-list-item-row-img"><img src="${window.EXTENSION_PATH}assets/folder.svg" class="token-image"></div>`)
				
			let row_chapter_title=$("<div class='row-chapter'></div>");
			let btn_edit_chapter=$(`
				<button style='height: 27px' class='token-row-button'>
					<img  src='${window.EXTENSION_PATH}assets/icons/rename-icon.svg'>
				</button>
			`);

			btn_edit_chapter.click(function(){
				// Convert the chapter title to an input field and focus it
				let input_chapter_title=$(`
					<input type='text' class='input-add-chapter' value='${self.chapters[i].title}'>
				`);
				
				input_chapter_title.keypress(function(e){
					
					if (e.which == 13 && input_chapter_title.val() !== "") {
						self.chapters[i].title = input_chapter_title.val();
						window.MB.sendMessage('custom/myVTT/JournalChapters',{
							chapters: self.chapters
						});
						self.persist();
						self.build_journal();
					}

					// If the user presses escape, cancel the edit
					if (e.which == 27) {
						self.build_journal();
					}
				});

				input_chapter_title.blur(function(){		
					let e = $.Event('keypress');
				    e.which = 13;
				    input_chapter_title.trigger(e);
				});

				row_chapter_title.empty();
				row_chapter_title.append(btn_edit_chapter);
				row_chapter_title.append(input_chapter_title);
				input_chapter_title.focus();

				// Convert the edit button to a save button
				btn_edit_chapter.empty();
				btn_edit_chapter.append(`
					<img src='${window.EXTENSION_PATH}assets/icons/save.svg'>
				`);
				btn_edit_chapter.css('z-index', '5');
			});
			
			let chapter_title=$("<div class='journal-chapter-title'/>");
			chapter_title.text(self.chapters[i].title);

			// If the user clicks the chapter title, expand/collapse the chapter notes
			chapter_title.click(function(){
				section_chapter.toggleClass('collapsed');
				self.chapters[i].collapsed = !self.chapters[i].collapsed;
				self.persist();
				window.MB.sendMessage('custom/myVTT/JournalChapters',{
					chapters: self.chapters
				});
			});
			
			let btn_del_chapter=$("<button class='btn-chapter-icon'><img height=10 src='"+window.EXTENSION_PATH+"assets/icons/delete.svg'></button>");
			
			btn_del_chapter.click(function(){
				// TODO: Make this better but default dialog is good enough for now
				if(confirm("Delete this chapter and all the contained notes?")){

					for(let k=0;k<self.chapters[i].notes.length;k++){
						let nid=self.chapters[i].notes[k];
						delete self.notes[nid];
					}

					self.chapters.splice(i,1);
					window.MB.sendMessage('custom/myVTT/JournalChapters',{
						chapters: self.chapters
					});
					self.persist();
					self.build_journal();
				}
			});

			let add_note_btn=$("<button class='token-row-button' ><img style='height: 20px' src='"+window.EXTENSION_PATH+"assets/icons/add_note.svg'></button>");

			add_note_btn.click(function(){
				let new_noteid=uuid();

				const input_add_note=$("<input type='text' class='input-add-chapter' placeholder='New note title'>");
				let note_added = false;
				input_add_note.keydown(function(e){
					if(e.keyCode == 13 && input_add_note.val() !== ""){
						note_added = true;
						let new_note_title=input_add_note.val();
						self.notes[new_noteid]={
							title: new_note_title,
							text: "",
							player: false,
							plain: ""
						};
						self.chapters[i].notes.push(new_noteid);
						window.MB.sendMessage('custom/myVTT/JournalChapters',{
							chapters: self.chapters
						});
						self.edit_note(new_noteid);
						self.persist();
						self.build_journal();
					}
					if(e.keyCode==27){
						self.build_journal();
					}
				});

				input_add_note.blur(function(event){	
					if(!note_added)	{
						let e = $.Event('keydown');
					    e.keyCode = 13;
					    input_add_note.trigger(e);
					}
					
				});

				row_notes_entry.empty();

				const save_note_btn=$("<button class='btn-chapter-icon'><img src='"+window.EXTENSION_PATH+"assets/icons/save.svg'></button>");

				
				row_notes_entry.append(save_note_btn);
				row_notes_entry.append(input_add_note);

				input_add_note.focus();
			});
				row_chapter_title.append(folderIcon);	
				row_chapter_title.append(chapter_title);
				if(window.DM) {
					row_chapter_title.append(add_note_btn);
					row_chapter_title.append(btn_edit_chapter);
					row_chapter_title.append(btn_del_chapter);	
				}	
				section_chapter.append(row_chapter_title);
				chapter_list.append(section_chapter);
				journalPanel.body.append(chapter_list);
		

			for(let n=0; n<self.chapters[i].notes.length;n++){
				
				let note_id=self.chapters[i].notes[n];
				
				if(! (note_id in self.notes))
					continue;
					
				if( (! window.DM) && (! self.notes[note_id].player) )
					continue;
				
				let entry=$(`<div class='sidebar-list-item-row-item sidebar-list-item-row' data-id='${note_id}'></div>`);
				let entry_title=$(`<div class='sidebar-list-item-row-details sidebar-list-item-row-details-title'></div>`);


				entry_title.text(self.notes[note_id].title);
				if(!self.notes[note_id].ddbsource){
					entry_title.click(function(){
						self.display_note(note_id);
					});
				}
				else{
					entry_title.click(function(){
						render_source_chapter_in_iframe(self.notes[note_id].ddbsource);
					});
				}
				let rename_btn = $("<button class='token-row-button'><img src='"+window.EXTENSION_PATH+"assets/icons/rename-icon.svg'></button>");
				
				rename_btn.click(function(){
					//Convert the note title to an input field and focus it
					const input_note_title=$(`
						<input type='text' class='input-add-chapter' value='${self.notes[note_id].title}'>
					`);

					input_note_title.keypress(function(e){
						if (e.which == 13 && input_note_title.val() !== "") {
							self.notes[note_id].title = input_note_title.val();
							window.MB.sendMessage('custom/myVTT/JournalNotes',{
								notes: self.notes
							});
							self.persist();
							self.build_journal();
						}

						// If the user presses escape, cancel the edit
						if (e.which == 27) {
							self.build_journal();
						}
					});

					input_note_title.blur(function(){		
						let e = $.Event('keypress');
					    e.which = 13;
					    input_note_title.trigger(e);
					});

					entry_title.empty();
					
					entry_title.append(input_note_title);
					entry_title.append(edit_btn);

					input_note_title.focus();

					// Convert the edit button to a save button
					rename_btn.empty();
					rename_btn.append(`
						<img src='${window.EXTENSION_PATH}assets/icons/save.svg'>
					`);
				});



				let edit_btn=$("<button class='token-row-button'><img src='"+window.EXTENSION_PATH+"assets/conditons/note.svg'></button>");
				edit_btn.click(function(){
					window.JOURNAL.edit_note(note_id);	
				});
				let note_index=n;
				let delete_btn=$("<button class='btn-chapter-icon delete-journal-chapter'><img src='"+window.EXTENSION_PATH+"assets/icons/delete.svg'></button>");
				delete_btn.click(function(){
					if(confirm("Delete this note?")){
						console.log("deleting note_index"+note_index);
						self.chapters[i].notes.splice(note_index,1);
						delete self.notes[note_id];
						self.build_journal();
						self.persist();
						window.MB.sendMessage('custom/myVTT/JournalChapters', {
							chapters: self.chapters
						});
					}
				});
								

				entry.append(entry_title);

				if(window.DM){
					if(!self.notes[note_id].ddbsource){
						entry.append(edit_btn);
						entry.append(rename_btn);		
					}
					entry.append(delete_btn);
				}

				note_list.append(entry);
			}

			// Create an add note button, when clicked, insert an input field above the button.
			// When the user presses enter, create a new note and insert it into the chapter.
			// If the user presses escape, cancel the edit.
			// If the user clicks outside the input field, cancel the edit.
			const row_notes_entry = $("<div class='row-notes-entry'/>");

			

			if(window.DM){
				
				let entry=$("<div class='journal-note-entry'></div>");
				entry.append(row_notes_entry);
				note_list.append(entry);
			}
			section_chapter.append(note_list);
		}	

		if(!window.journalsortable)
			$('#journal-panel .ui-sortable').sortable('disable'); 

		let sort_button = $(`<button class="token-row-button reorder-button" title="Reorder Journal"><span class="material-icons">reorder</span></button>`);

		sort_button.on('click', function(){
			if($('#journal-panel .ui-sortable-disabled').length > 0){
				$('#journal-panel .ui-sortable').sortable('enable'); 
				window.journalsortable = true;
			}
			else{
				$('#journal-panel .ui-sortable').sortable('disable'); 
				window.journalsortable = false;
				
			}
		});
		if(window.DM){
			let chapterImport = $(`<select id='ddb-source-journal-import'><option value=''>Select a source to import</option></select>`);
			chapterImport.append($(`<option value='/magic-items'>Magic Items</option>`));
			chapterImport.append($(`<option value='/feats'>Feats</option>`));
			chapterImport.append($(`<option value='/spells'>Spells</option>`));
			window.ScenesHandler.build_adventures(function(){
				for(let source in window.ScenesHandler.sources){
					let sourcetitle = window.ScenesHandler.sources[source].title;
					chapterImport.append($(`<option value='${source}'>${sourcetitle}</option>`));
				}
			});
			chapterImport.on('change', function(){
				let source = this.value;
				
				if (source == '/magic-items' || source == '/feats' || source == '/spells'){
					let new_noteid=uuid();
					let new_note_title = source.replaceAll(/-/g, ' ')
											.replaceAll(/\//g, '')
											.replaceAll(/\b\w/g, l => l.toUpperCase());

					self.notes[new_noteid]={
						title: new_note_title,
						text: "",
						player: false,
						plain: "",
						ddbsource: `https://dndbeyond.com${source}`
					};
					let chapter = self.chapters.find(x => x.title == 'Compendium')
					if(!chapter){
						self.chapters.push({
							title: 'Compendium',
							collapsed: false,
							notes: [],
						});
						chapter = self.chapters[self.chapters.length-1];
					}
					
					chapter.notes.push(new_noteid);
					self.persist();
					self.build_journal();
				}
				else{
					self.chapters.push({
						title: window.ScenesHandler.sources[source].title,
						collapsed: false,
						notes: [],
					});
					window.ScenesHandler.build_chapters(source, function(){
						for(let chapter in window.ScenesHandler.sources[source].chapters){
							let new_noteid=uuid();
							let new_note_title = window.ScenesHandler.sources[source].chapters[chapter].title;
							self.notes[new_noteid]={
								title: new_note_title,
								text: "",
								player: false,
								plain: "",
								ddbsource: window.ScenesHandler.sources[source].chapters[chapter].url
							};
							self.chapters[self.chapters.length-1].notes.push(new_noteid);
						}
						self.persist();
						self.build_journal();
					});
				}
			})

			$('#journal-panel .sidebar-panel-body').prepend(sort_button, chapterImport);
		}
	}
	
	
	display_note(id, statBlock = false){
		let self=this;
		let note=$("<div class='note'></div>");
		
		note.attr('title',self.notes[id].title);
		if(window.DM){
			let visibility_container=$("<div class='visibility-container'/>");
			let visibility_toggle=$("<input type='checkbox'>");
			
			visibility_toggle.prop("checked",self.notes[id].player);
				
			visibility_toggle.change(function(){
				window.JOURNAL.note_visibility(id,visibility_toggle.is(":checked"));
			});
			visibility_container.append(visibility_toggle);
			visibility_container.append(" visible to players");
			
			let popup_btn=$("<button>Force Open by Players</button>");
			
			popup_btn.click(function(){
				window.MB.sendMessage('custom/myVTT/note',{
						id: id,
						note:self.notes[id],
						popup: true,
					});
			});
			
			visibility_container.append(popup_btn);
			
			let edit_btn=$("<button>Edit</button>");
			edit_btn.click(function(){
				note.remove();
				window.JOURNAL.edit_note(id, statBlock);
			});
			
			visibility_container.append(edit_btn);
			
			note.append(visibility_container);
			
		}
		let note_text=$("<div class='note-text'/>");
		note_text.append(DOMPurify.sanitize(self.notes[id].text,{ADD_TAGS: ['img','div','p', 'b', 'button', 'span', 'style', 'path', 'svg','iframe','a','video','ul','ol','li'], ADD_ATTR: ['allowfullscreen', 'allow', 'scrolling','src','frameborder','width','height']}));
		if(statBlock){
			this.translateHtmlAndBlocks(note_text);
		}
		this.add_journal_roll_buttons(note_text);
		this.add_journal_tooltip_targets(note_text);

		add_stat_block_hover(note_text);
		
		note.append(note_text);
		note.find("a").attr("target","_blank");
		note.dialog({
			draggable: true,
			width: 800,
			height: 600,
			position:{
			   my: "center",
			   at: "center-200",
			   of: window
			},
			close: function( event, ui ) {
				$(this).remove();
				}
			});	
		$("[role='dialog']").draggable({
			containment: "#windowContainment",
			start: function () {
				$("#resizeDragMon").append($('<div class="iframeResizeCover"></div>'));			
				$("#sheet").append($('<div class="iframeResizeCover"></div>'));
			},
			stop: function () {
				$('.iframeResizeCover').remove();			
			}
		});
		$("[role='dialog']").resizable({
			start: function () {
				$("#resizeDragMon").append($('<div class="iframeResizeCover"></div>'));			
				$("#sheet").append($('<div class="iframeResizeCover"></div>'));
			},
			stop: function () {
				$('.iframeResizeCover').remove();			
			}
		});
		if(!window.DM)
			$("[role='dialog']").css("height", "calc(100vh - 80px)")	
		note.parent().mousedown(function() {
			frame_z_index_when_click($(this));
		});		
		let btn_popout=$(`<div class="popout-button journal-button"><svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="#000000"><path d="M0 0h24v24H0V0z" fill="none"></path><path d="M18 19H6c-.55 0-1-.45-1-1V6c0-.55.45-1 1-1h5c.55 0 1-.45 1-1s-.45-1-1-1H5c-1.11 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-6c0-.55-.45-1-1-1s-1 .45-1 1v5c0 .55-.45 1-1 1zM14 4c0 .55.45 1 1 1h2.59l-9.13 9.13c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0L19 6.41V9c0 .55.45 1 1 1s1-.45 1-1V4c0-.55-.45-1-1-1h-5c-.55 0-1 .45-1 1z"></path></svg></div>"`);
		note.parent().append(btn_popout);
		btn_popout.click(function(){	
			let uiId = $(this).siblings(".note").attr("id");
			let journal_text = $(`#${uiId}.note .note-text`)
			popoutWindow(self.notes[id].title, note, journal_text.width(), journal_text.height());
			removeFromPopoutWindow(self.notes[id].title, ".visibility-container");
			removeFromPopoutWindow(self.notes[id].title, ".ui-resizable-handle");
			$(window.childWindows[self.notes[id].title].document).find(".note").attr("style", "overflow:visible; max-height: none !important; height: auto; min-height: 100%;");
			$(this).siblings(".ui-dialog-titlebar").children(".ui-dialog-titlebar-close").click();
		});
		note.off('click').on('click', '.int_source_link', function(event){
			event.preventDefault();
			render_source_chapter_in_iframe(event.target.href);
		});

	}
	add_journal_tooltip_targets(target){
		$(target).find('.tooltip-hover').each(function(){
			let self = this;
			if(!$(self).attr('data-tooltip-href'))
			window.JOURNAL.getDataTooltip(self.href, function(url){
				$(self).attr('data-tooltip-href', url);
			});
		});
	}

	getDataTooltip(url, callback){
		if(window.spellIdCache == undefined){
			window.spellIdCache = {};
		}
		const urlRegex = /www\.dndbeyond\.com\/[a-zA-Z\-]+\/([0-9]+)/g;
		const urlType = /www\.dndbeyond\.com\/([a-zA-Z\-]+)/g;
		let itemId = (url.matchAll(urlRegex).next().value) ? url.matchAll(urlRegex).next().value[1] : 0;
		const itemType = url.matchAll(urlType).next().value[1];
		url = url.toLowerCase();
		if(itemId == 0){
			if(window.spellIdCache[url]){
				callback(`www.dndbeyond.com/${itemType}/${window.spellIdCache[url]}-tooltip?disable-webm=1`);	
			}
			else{
				let spellPage = '';			
				$.get(url,  function (data) {
				    spellPage = data;
				}).done(function(){
					const regex = /id\:[0-9]+/g;
					const itemId = $(spellPage).find('.more-info.details-more-info .detail-content script').text().match(regex)[0].split(':')[1];
					window.spellIdCache[url] = itemId;
					callback(`www.dndbeyond.com/${itemType}/${itemId}-tooltip?disable-webm=1`);	
				})
			}
			
		}
		else{
			callback(`www.dndbeyond.com/${itemType}/${itemId}-tooltip?disable-webm=1`);	
		}
		
	}

	add_journal_roll_buttons(target){
		console.group("add_journal_roll_buttons")
		
		const clickHandler = function(clickEvent) {
			roll_button_clicked(clickEvent, window.PLAYER_NAME, window.PLAYER_IMG)
		};

		const rightClickHandler = function(contextmenuEvent) {
			roll_button_contextmenu_handler(contextmenuEvent, window.PLAYER_NAME, window.PLAYER_IMG);
		}

		// replace all "to hit" and "damage" rolls
	
		let currentElement = $(target).clone()

		// apply most specific regex first matching all possible ways to write a dice notation
		// to account for all the nuances of DNDB dice notation.
		// numbers can be swapped for any number in the following comment
		// matches "1d10", " 1d10 ", "1d10+1", " 1d10+1 ", "1d10 + 1" " 1d10 + 1 "
		const damageRollRegex = /(([0-9]+d[0-9]+)\s?([+-]\s?[0-9]+)?)/g
		// matches " +1 " or " + 1 "
		const hitRollRegex = /(\s)([+-]\s?[0-9]+)(\s)|\(([+-]\s?[0-9]+)\)|([^0-9'"][^0-9'"])([+-]\s?[0-9]+)/g
		const htmlNoSpaceHitRollRegex = />([+-]\s?[0-9]+)</g
		const dRollRegex = /\s(\s?d[0-9]+)\s/g
		const tableNoSpaceRollRegex = />(\s?d[0-9]+\s?)</g
		const rechargeRegEx = /(Recharge [0-6]?\s?[–-]?\s?[0-6])/g
		const actionType = "roll"
		const rollType = "AboveVTT"
		const updated = currentElement.html()
			.replaceAll(damageRollRegex, ` <button data-exp='$2' data-mod='$3' data-rolltype='damage' data-actiontype='${actionType}' class='avtt-roll-button' title='${actionType}'> $1</button> `)
			.replaceAll(hitRollRegex, `$5$1<button data-exp='1d20' data-mod='$2$4$6' data-rolltype='to hit' data-actiontype=${actionType} class='avtt-roll-button' title='${actionType}'> $2$4$6</button>$3`)
			.replaceAll(htmlNoSpaceHitRollRegex, `><button data-exp='1d20' data-mod='$1' data-rolltype='to hit' data-actiontype=${actionType} class='avtt-roll-button' title='${actionType}'> $1</button><`)
			.replaceAll(dRollRegex, ` <button data-exp='1$1' data-mod='0' data-rolltype='to hit' data-actiontype=${actionType} class='avtt-roll-button' title='${actionType}'> $1</button> `)
			.replaceAll(tableNoSpaceRollRegex, `><button data-exp='1$1' data-mod='0' data-rolltype='to hit' data-actiontype=${actionType} class='avtt-roll-button' title='${actionType}'> $1</button><`)
			.replaceAll(rechargeRegEx, `<button data-exp='1d6' data-mod='' data-rolltype='recharge' data-actiontype='Recharge' class='avtt-roll-button' title='${actionType}'> $1</button>`)
			
		

		$(target).html(updated);

		$(target).find('button[data-rolltype="damage"], button[data-rolltype="to hit"]').each(function(){
			let rollAction = $(this).prevUntil('em>strong').find('strong').last().text().replace('.', '');
			rollAction = (rollAction == '') ? $(this).parent().prevUntil('em>strong').find('strong').last().text().replace('.', '') : rollAction;
			if(rollAction == ''){
				$(this).attr('data-rolltype', 'roll');
				$(this).attr('data-actiontype', 'AboveVTT');	
			}
			else{
				$(this).attr('data-actiontype', rollAction);
			}
			
		})
		
		// terminate the clones reference, overkill but rather be safe when it comes to memory
		currentElement = null
	
		$(target).find(".avtt-roll-button").click(clickHandler);
		$(target).find(".avtt-roll-button").on("contextmenu", rightClickHandler);
		console.groupEnd()
	}

    translateHtmlAndBlocks(target) {
    	data = $(target).clone().html();

        let lines = data.split(/(<br \/>|<br>|<p>|\n)/g);
        lines = lines.map((line, li) => {
            let input = line;
            input = input.replace(/&nbsp;/g,' ')
            // Find name
            // e.g. Frightful Presence.
            let name = (
                input.match(/^(([A-Z][^ ]+ ?){1,7}(\([^\)]+\))?\.)/gim) || []
            ).toString();

            // Remove period at the end of the name
            name = name.replace(/\.$/, '');
            // Remove whitespace from the name
            name = name.split('(')[0].trim();

            // Remove space between letter ranges
            // e.g. a- b
            input = input.replace(/([a-z])- ([a-z])/gi, '$1$2');
            // Replace with right single quote
            input = input.replace(/'/g, '’');
            // e.g. Divine Touch. Melee Spell Attack:
            input = input.replace(
                /^(([A-Z0-9][^ .]+ ?){1,2}(\([^\)]+\))?\.)( (Melee|Ranged|Melee or Ranged) (Weapon|Spell) Attack:)?/gim,
                /(lair|legendary) actions/g.test(data)
                    ? '<strong>$1</strong>'
                    : '<em><strong>$1</strong>$4</em>'
            );
            // Emphasize hit
            input = input.replace(/Hit:/g, '<em>Hit:</em>');
            // Emphasize hit or miss
            input = input.replace(/Hit or Miss:/g, '<em>Hit or Miss:</em>');
  
            // Find attack actions
            input = input.replace(/(attack) action/gi, 
            	function(m){
                	let actionId = window.ddbConfigJson.basicActions.filter((d) => d.name.localeCompare(m, undefined, { sensitivity: 'base' }) == 0)[0].id;
               		return `<a class="tooltip-hover skill-tooltip" href="/compendium/rules/basic-rules/combat#$attack" aria-haspopup="true" data-tooltip-href="/actions/${actionId}-tooltip" data-tooltip-json-href="/skills/${actionId}/tooltip-json" target="_blank">attack</a> action`
                });
            // Find cover rules
            input = input.replace(
                /(?<!\])[\#\>]?(total cover|heavily obscured|lightly obscured)/gi,
                function(m){
                	if(m.startsWith('#') || m.startsWith('>'))
                		return m;
                	
                	let rulesId = window.ddbConfigJson.rules.filter((d) => d.name.localeCompare(m, undefined, { sensitivity: 'base' }) == 0)[0].id;
               		return `<a class="tooltip-hover condition-tooltip" href="/compendium/rules/basic-rules/combat#${m}" aria-haspopup="true" data-tooltip-href="/rules/${rulesId}-tooltip" data-tooltip-json-href="/conditions/${rulesId}/tooltip-json" target="_blank">${m}</a>`
                }
            );
            // Find conditions
            input = input.replace(
                /(?<!\])[\#\>]?(blinded|charmed|deafened|exhaustion|frightened|grappled|incapacitated|invisible|paralyzed|petrified|poisoned|prone|restrained|stunned|unconscious)/gi,
                function(m){
                	if(m.startsWith('#') || m.startsWith('>'))
                		return m;
                	
                	let conditionId = window.ddbConfigJson.conditions.filter((d) => d.definition.name.localeCompare(m, undefined, { sensitivity: 'base' }) == 0)[0].definition.id;
               		return `<a class="tooltip-hover condition-tooltip" href="/compendium/rules/basic-rules/appendix-a-conditions#${m}" aria-haspopup="true" data-tooltip-href="/conditions/${conditionId}-tooltip" data-tooltip-json-href="/conditions/${conditionId}/tooltip-json" target="_blank">${m}</a>`
                }
            );
            // Find skills
            input = input.replace(
                /(?<!\])[\#\>]?(athletics|acrobatics|sleight of hand|stealth|arcana|history|investigation|nature|religion|animal handling|insight|medicine|perception|survival|deception|intimidation|performance|persuasion)/gi,
                function(m){
                	if(m.startsWith('#') || m.startsWith('>'))
                		return m;
                	
                	let skillId = window.ddbConfigJson.abilitySkills.filter((d) => d.name.localeCompare(m, undefined, { sensitivity: 'base' }) == 0)[0].id;
               		return `<a class="tooltip-hover skill-tooltip" href="/compendium/rules/basic-rules/using-ability-scores#${m}" aria-haspopup="true" data-tooltip-href="/skills/${skillId}-tooltip" data-tooltip-json-href="/skills/${skillId}/tooltip-json" target="_blank">${m}</a>`
                }

            );
            // Find opportunity attacks
            input = input.replace(
                /(?<!\]|;)[\#\>]?(opportunity attack)s/gi,
                function(m){
                	if(m.startsWith('#') || m.startsWith('>'))
                		return m;
                	
                	let actionId = window.ddbConfigJson.basicActions.filter((d) => d.name.localeCompare(m, undefined, { sensitivity: 'base' }) == 0)[0].id;
               		return `<a class="tooltip-hover skill-tooltip" href="/compendium/rules/basic-rules/combat#${m}" aria-haspopup="true" data-tooltip-href="/actions/${actionId}-tooltip" data-tooltip-json-href="/skills/${actionId}/tooltip-json" target="_blank">${m}</a>`
                }
            );
            // find opportunity attack
            input = input.replace(
                /(?<!\]|;)[\#\>]?(opportunity attack)/gi,
                function(m){
                	if(m.startsWith('#') || m.startsWith('>'))
                		return m;
                	
                	let actionId = window.ddbConfigJson.basicActions.filter((d) => d.name.localeCompare(m, undefined, { sensitivity: 'base' }) == 0)[0].id;
               		return `<a class="tooltip-hover skill-tooltip" href="/compendium/rules/basic-rules/combat#${m}" aria-haspopup="true" data-tooltip-href="/actions/${actionId}-tooltip" data-tooltip-json-href="/skills/${actionId}/tooltip-json" target="_blank">${m}</a>`
                }
            );
            // Add parens for escape dc
            input = input.replace(/ escape DC/g, ' (escape DC');
            input = input.replace(/(DC )(\d+) (\:|\.|,)/g, '$1$2)$3');
            // Fix parens for dice
            // e.g. (3d6 + 12) thunder
            input = input.replace(/\(?(\d+d\d+( \+ \d+)?)\)? ? (\w)/g, '($1) $3');
            // Try to find spells
            input = input.replace(
                / (the|a|an) (([\w]+ ?){1,4}) spell( |\.|\:|,)/g,
                ' $1 [spell]$2[/spell] spell$4'
            );
            // another spell attempt
            input = input.replace(
                /casts (([\w]+ ?){1,4}),/g,
                'casts [spell]$1[/spell],'
            );
            // Search for spell casting section
            const spellcasting = lines.findIndex((l) =>
                l.match(/Spellcasting([^.]+)?./g)
            );
            // If we find the section, loop through the levels
            if (
                spellcasting >= 0 &&
                spellcasting < li &&
                (input.startsWith('At will:') ||
                    input.startsWith('Cantrips (at will):') ||
                    input.match(/(\d+\/day( each)?|\d+\w+ level \(\d slots?\))\:/gi))
            ) {
            	let eachNumberFound = (input.match(/\d+\/day( each)?/gi)) ? parseInt(input.match(/[0-9]+(?![0-9]?px)/gi)[0]) : undefined;
            	let slotsNumberFound = (input.match(/\d+\w+ level \(\d slots?\)\:/gi)) ? parseInt(input.match(/[0-9]+/gi)[1]) : undefined;
            	let spellLevelFound = (slotsNumberFound) ? input.match(/\d+\w+ level/gi)[0] : undefined;
                let parts = input.split(/:\s(?<!left:\s?)/g);
                parts[1] = parts[1].split(/,\s(?![^(]*\))/gm);
                for (let p in parts[1]) {
                	let spellName = (parts[1][p].startsWith('<a')) ? $(parts[1][p]).text() : parts[1][p].replace(/<\/?p[a-zA-z'"0-9\s]+?>/g, '').replace(/\s?\[spell\]\s?|\s?\[\/spell\]\s?/g, '').replace('[/spell]', '').replace(/\s|&nbsp;/g, '');

                	if(parts[1][p].startsWith('<') || parts[1][p].startsWith('[spell]') ){
						parts[1][p] = parts[1][p]
                            .replace(/^/gm, ``)
                            .replace(/( \(|(?<!\))$)/gm, '');
                	}
                   	else if(parts[1][p] && typeof parts[1][p] === 'string') {
                        parts[1][p] = parts[1][p].split('<')[0]
                            .replace(/^/gm, `[spell]`)
                            .replace(/( \(|(?<!\))$)/gm, '[/spell]');
                    }

                    if(eachNumberFound){
                    	parts[1][p] = `<span class="add-input each" data-number="${eachNumberFound}" data-spell="${spellName}">${parts[1][p]}</span>`
                    }
                }
                parts[1] = parts[1].join(', ');
                input = parts.join(': ');
                if(slotsNumberFound){
                	input = `<span class="add-input slots" data-number="${slotsNumberFound}" data-spell="${spellLevelFound}">${input}</span>`
                }
            }

            input = input.replace(/\[spell\](.*?)\[\/spell\]/g, function(m){
            	let spell = m.replace(/<\/?p>/g, '').replace(/\s?\[spell\]\s?|\s?\[\/spell\]\s?/g, '').replace('[/spell]', '');
            	let spellUrl = spell.replace(/\s/g, '-');
                return `<a class="tooltip-hover spell-tooltip" href="https://www.dndbeyond.com/spells/${spellUrl}" aria-haspopup="true" target="_blank">${spell}</a>`
            })

            // Find senses
            input = input.replace(
                /(?<!\])[\#\>]?(truesight|blindsight|darkvision|tremorsense)/gi,
                 function(m){
                	if(m.startsWith('#') || m.startsWith('>'))
                		return m;
                	
                	let senseId = window.ddbConfigJson.senses.filter((d) => d.name.localeCompare(m, undefined, { sensitivity: 'base' }) == 0)[0].id;
               		return `<a class="tooltip-hover skill-tooltip" href="/compendium/rules/basic-rules/monsters#${m}" aria-haspopup="true" data-tooltip-href="/senses/${senseId}-tooltip" data-tooltip-json-href="/skills/${senseId}/tooltip-json" target="_blank">${m}</a>`
                }
            );

            // Find actions
            input = input.replace(
                /(?<!\])[\#\>]?((dash|disengage|help|hide|use an object|dodge|search|ready|cast a spell))/gim,
                function(m){
                	if(m.startsWith('#') || m.startsWith('>'))
                		return m;
                	
                	let actionId = window.ddbConfigJson.basicActions.filter((d) => d.name.localeCompare(m, undefined, { sensitivity: 'base' }) == 0)[0].id;
               		return `<a class="tooltip-hover skill-tooltip" href="/compendium/rules/basic-rules/combat#${m}" aria-haspopup="true" data-tooltip-href="/actions/${actionId}-tooltip" data-tooltip-json-href="/skills/${actionId}/tooltip-json" target="_blank">${m}</a>`
                }
            );
 
            input = input.replace(/\&nbsp\;/g, ' ');
            // Replace quotes to entity
            input = input.replace(/\'/g, '&rsquo;');
            return input;
        });

        $(target).html(lines.join(``));
    }
	
	note_visibility(id,visibility){
		this.notes[id].player=visibility;
		window.MB.sendMessage("custom/myVTT/note", {
			note: this.notes[id],
			id: id
		})
		this.persist();
	}
	
	close_all_notes(){
		$("textarea[data-note-id]").each(function(){
			let taid=$(this).attr('id')
			tinyMCE.get(taid).execCommand('mceSave');
			$(this).closest(".note").dialog("close");
		});
	}

	edit_note(id, statBlock = false){
		this.close_all_notes();
		let self=this;
		
		let note=$("<div class='note'></div>");
		let form=$("<form></form>");
		let tmp=uuid();
		let ta=$("<textarea id='"+tmp+"' name='ajax_text' class='j-wysiwyg-editor text-editor' data-note-id='"+id+"'></textarea>");
		ta.css('width','100%');
		ta.css('height','100%');
		form.append(ta);
		
		note.append(form);
		
		if(self.notes[id]){
			ta.text(self.notes[id].text);
		}
		
		note.attr('title',self.notes[id].title);
		
		$("#site-main").append(note);
		note.dialog({
			draggable: true,
			width: 800,
			height: 600,
			position: {
			   my: "center",
			   at: "center-200",
			   of: window
			},
			open: function(event, ui){
				let btn_view=$(`<button class='journal-view-button journal-button'><img height="10" src="chrome-extension://kkemdlbhcdjeammninnkkaclnflbodmj/assets/icons/view.svg"></button>"`);
				$(this).siblings('.ui-dialog-titlebar').prepend(btn_view);
				btn_view.click(function(){	
					self.close_all_notes();
					self.display_note(id, statBlock);
				});
			},
			close: function( event, ui ) {
				// console.log(event);
				let taid=$(event.target).find("textarea").attr('id');
				tinyMCE.get(taid).execCommand('mceSave');
				$(this).remove();
			}
		});

		$("[role='dialog']").draggable({
			containment: "#windowContainment",
			start: function () {
				$("#resizeDragMon").append($('<div class="iframeResizeCover"></div>'));			
				$("#sheet").append($('<div class="iframeResizeCover"></div>'));
			},
			stop: function () {
				$('.iframeResizeCover').remove();			
			}
		});
		$("[role='dialog']").resizable({
			start: function () {
				$("#resizeDragMon").append($('<div class="iframeResizeCover"></div>'));			
				$("#sheet").append($('<div class="iframeResizeCover"></div>'));
			},
			stop: function () {
				$('.iframeResizeCover').remove();			
			}
		});
		note.parent().mousedown(function() {
			frame_z_index_when_click($(this));
		});
		
		
		tinyMCE.init({
			selector: '#' + tmp,
			menubar: false,
			style_formats:  [
				 { title: 'Headers', items: [
			      { title: 'h1', block: 'h1' },
			      { title: 'h2', block: 'h2' },
			      { title: 'h3', block: 'h3' },
			      { title: 'h4', block: 'h4' },
			      { title: 'h5', block: 'h5' },
			      { title: 'h6', block: 'h6' }
			    ] },
				{ title: 'Containers', items: [
			      { title: 'Quote Box', block: 'div', wrapper: true, classes: 'text--quote-box'},
			      { title: 'Rules Text', block: 'div', wrapper: true, classes: 'rules-text' },
			      { title: 'Ripped Paper', block: 'div', wrapper: true, classes: 'block-torn-paper' },
			      { title: 'Read Aloud Text', block: 'div', wrapper: true, classes: 'read-aloud-text' },
			      { title: 'Stat Block Paper', block: 'div', wrapper: true, classes: 'Basic-Text-Frame stat-block-background' },
			    ] },
			    { title: 'Custom Statblock Stats', items: [
			      { title: 'AC', inline: 'b', classes: 'custom-ac custom-stat'},
			      { title: 'Average HP', inline: 'b',classes: 'custom-avghp custom-stat' },
			      { title: 'HP Roll', inline: 'b', classes: 'custom-hp-roll custom-stat' },
			      { title: 'Initiative', inline: 'b', classes: 'custom-initiative custom-stat' },
			   	]}
			],
			plugins: 'save,hr,image,link,lists,media,paste,tabfocus,textcolor,colorpicker,autoresize, code, table',
			toolbar1: 'undo styleselect | hr | bold italic underline strikethrough | alignleft aligncenter alignright justify| outdent indent | bullist numlist | forecolor backcolor | fontsizeselect | link unlink | image media | table | code',
			image_class_list: [
				{title: 'Magnify', value: 'magnify'},
			],
			external_plugins: {
				'image': "/content/1-0-1688-0/js/tinymce/tiny_mce/plugins/image/plugin.min.js",
			},
			link_class_list: [
			   {title: 'External Link', value: 'ext_link'},
			   {title: 'DNDBeyond Source Link', value: 'int_source_link'},
			   {title: 'DDB Tooltip Links',
			      menu: [
			        {title: 'Spell', value: 'tooltip-hover spell-tooltip'},
			        {title: 'Magic Item', value: 'tooltip-hover magic-item-tooltip'},
			        {title: 'Monster', value: 'tooltip-hover monster-tooltip'}
			      ]
			    }
			],
			relative_urls : false,
			remove_script_host : false,
			convert_urls : true,
			media_alt_source: false,
			media_poster: false,
			statusbar: false,
			content_style: `
				/* START LRKP CSS fixes */

				/* COMPENDIUM IMPROVEMENTS */
				/* START - Default text color */

				:root {
					--theme-page-fg-color: #242527;
				}
				/* END - Default text color */
				*{
					font-family: Roboto, Helvetica, sans-serif;
				}

				.Basic-Text-Frame {
				    clear: both;
				    border: 1px solid #d4d0ce;
				    background: white;
				    padding: 15px
				}

				@media(min-width: 768px) {
				    .Basic-Text-Frame {
				        -webkit-column-count:2;
				        column-count: 2
				    }
				}

				.Basic-Text-Frame-2 {
				    border: 1px solid #d4d0ce;
				    background: white;
				    padding: 15px
				}

				@media(min-width: 768px) {
				    .Basic-Text-Frame-2 {
				        float:right;
				        margin: 30px 0 15px 20px;
				        width: 410px
				    }
				}

				.Basic-Text-Frame-2 .compendium-image-center {
				    margin-bottom: 20px;
				    display: block
				}

				.Basic-Text-Frame-3 {
				    border: 1px solid #d4d0ce;
				    background: white;
				    padding: 15px
				}

				@media(min-width: 768px) {
				    .Basic-Text-Frame-3 {
				        float:left;
				        margin: 30px 20px 15px 0;
				        width: 410px
				    }
				}

				.Basic-Text-Frame-3 .compendium-image-center {
				    margin-bottom: 20px;
				    display: block
				}

				.Basic-Text-Frame,.Basic-Text-Frame-2,.Basic-Text-Frame-3 {
				    position: relative;
				    box-shadow: 0 0 5px #979AA4
				}

				.Basic-Text-Frame::before,.Basic-Text-Frame::after,.Basic-Text-Frame-2::before,.Basic-Text-Frame-2::after,.Basic-Text-Frame-3::before,.Basic-Text-Frame-3::after {
				    content: '';
				    background-image: url("../images/MMStatBar_lrg.jpg");
				    background-size: 100% 100%;
				    background-position: center;
				    height: 4px;
				    display: inline-block;
				    position: absolute
				}

				.Basic-Text-Frame::before,.Basic-Text-Frame-2::before,.Basic-Text-Frame-3::before {
				    left: -3px;
				    top: -3px;
				    right: -3px
				}

				.Basic-Text-Frame::after,.Basic-Text-Frame-2::after,.Basic-Text-Frame-3::after {
				    left: -3px;
				    bottom: -3px;
				    right: -3px
				}

				.Stat-Block-Styles_Stat-Block-Title {
				    font-size: 18px!important;
				    font-family: "Roboto Condensed",Roboto,Helvetica,sans-serif;
				    text-transform: uppercase;
				    font-weight: bold;
				    line-height: 1.4!important;
				    margin-bottom: 0!important;
				    display: inline;
				    margin-right: 8px
				}

				.Stat-Block-Styles_Stat-Block-Metadata {
				    font-style: italic;
				    font-size: 14px!important;
				    line-height: 1.4!important;
				    margin-bottom: 8px!important
				}

				.Stat-Block-Styles_Stat-Block-Metadata::after {
				    content: "";
				    display: block;
				    border-bottom: 2px solid #bc0f0f;
				    padding-top: 5px
				}

				.Stat-Block-Styles_Stat-Block-Bar-Object-Space,.Stat-Block-Styles_Stat-Block-Bar-Object-Space-Last {
				    display: none
				}

				.Stat-Block-Styles_Stat-Block-Data,.Stat-Block-Styles_Stat-Block-Data-Last,.Stat-Block-Styles_Stat-Block-Body,.Stat-Block-Styles_Stat-Block-Hanging,.Stat-Block-Styles_Stat-Block-Hanging-Last,.Stat-Block-Styles_Stat-Block-Body-Last--apply-before-heading- {
				    font-size: 14px!important;
				    line-height: 1.4!important;
				    margin-bottom: 10px!important
				}

				.Stat-Block-Styles_Stat-Block-Heading,.Stat-Block-Styles_Stat-Block-Heading--after-last-bar- {
				    font-size: 16px!important;
				    font-weight: bold;
				    font-family: "Roboto Condensed",Roboto,Helvetica,sans-serif
				}

				.Stat-Block-Styles_Stat-Block-Heading::after,.Stat-Block-Styles_Stat-Block-Heading--after-last-bar-::after {
				    content: "";
				    display: block;
				    border-bottom: 1px solid #bc0f0f;
				    padding-top: 2px
				}

				.Stat-Block-Styles_Stat-Block-Data-Last {
				    border-bottom: 2px solid #bc0f0f;
				    padding-bottom: 10px
				}

				.stat-block-ability-scores {
				    display: -webkit-flex;
				    display: -ms-flexbox;
				    display: flex;
				    -webkit-flex-wrap: wrap;
				    -ms-flex-wrap: wrap;
				    flex-wrap: wrap;
				    border-top: 2px solid #bc0f0f;
				    border-bottom: 2px solid #bc0f0f;
				    margin: 10px 0
				}

				.stat-block-ability-scores-stat {
				    width: 33.33333%;
				    padding: 10px 5px;
				    text-align: center
				}
				/* START - New quote box implementation */
				.text--quote-box {
				    display: block !important;
				    background-color: var(--compendium-quote-box-color, #FAF8EC) !important; /*Fallback: if the variable isn't declared, it'll default to pale yellow*/
				    padding: 20px 25px 15px 25px !important;
				    position: relative !important;
				    width: auto !important;
				    display: flex !important;
				    flex-direction: column !important;
				    overflow: visible !important;
				    border-radius: 0 !important;
				    border-left: 1px solid !important;
				    border-right: 1px solid !important;
				    border-color: var(--compendium-quote-box-border, #620000) !important; /*Fallback: if the variable isn't declared, it'll default to dark red*/
				    border-top: 0;
				    border-bottom: 0;
				    color: var(--theme-page-fg-color, #242527) !important;
				    margin: 40px 20px !important;
				    line-height: 1.6 !important;
				    font-size: 14px !important;
				}
				.text--quote-box::before {
				    top: -4px !important;
				}
				.text--quote-box::before, .text--quote-box::after {
				    content: '';
				    border-radius: 50%;
				    background-position: left !important;
				    background-size: contain !important;
				    background-repeat: no-repeat !important;
				    height: 8px !important;
				    width: 8px !important;
				    left: -4px !important;
				    position: absolute !important;
				    background-color: var(--compendium-quote-box-corner, #620000);
				}
				 .text--quote-box::after {
				    bottom: -4px !important;
				}
				 .text--quote-box p:first-of-type::before {
				    top: -4px !important;
				}
				 .text--quote-box p:first-of-type::before,  .text--quote-box p:last-of-type::after {
				    content: '';
				    border-radius: 50%;
				    background-position: right !important;
				    background-size: contain !important;
				    background-repeat: no-repeat !important;
				    height: 8px !important;
				    width: 8px !important;
				    right: -4px !important;
				    position: absolute !important;
				    background-color: var(--compendium-quote-box-corner, #620000);
				}
				 .text--quote-box p:last-of-type::after {
				    bottom: -4px !important;
				}
				 .text--quote-box p:last-of-type {
				    margin-bottom: 5px !important;
				}
				/* END - New quote box implementation */

				/* START - New rules sidebar implementation */
				.text--rules-sidebar {
				    display: block !important;
				    background-color: var(--compendium-rules-sidebar-color, #DAE4C1) !important; /*Fallback: if the variable isn't declared, it'll default to pale-green*/
				    position: relative !important;
				    width: auto !important;
				    display: flex !important;
				    flex-direction: column !important;
				    overflow: visible !important;
				    margin: 30px 5px !important;
				    line-height: 1.6 !important;
				    font-size: 14px !important;
				    padding: 25px 28px 15px 30px !important;
				    border-radius: 0 !important;
				    border-top: 3px solid #231f20 !important;
				    border-bottom: 3px solid #231f20 !important;
				    border-left: 1.5px solid  #b3b3b3 !important;
				    border-right: 1.5px solid  #b3b3b3 !important;
				    color: var(--theme-page-fg-color, #242527) !important;
				    filter: drop-shadow(0px 5px 8px #ccc);
				}

				.text--rules-sidebar p:first-of-type {
				    text-transform: uppercase;
				    font-weight: bold;
				    font-size: 16px;
				}

				.text--rules-sidebar .action-tooltip, .text--rules-sidebar .condition-tooltip, .text--rules-sidebar .item-tooltip, .text--rules-sidebar .rule-tooltip, .text--rules-sidebar .sense-tooltip, .text--rules-sidebar .skill-tooltip, .text--rules-sidebar .weapon-properties-tooltip, .text--rules-sidebar .action-tooltip {
				    color: #129b54 !important;
				}

				.text--rules-sidebar::before {
				    top: -13px !important;
				    right: 0.1px !important;
				    left: 0.1px !important;
				}

				.text--rules-sidebar::before {
				    content: '';
				    background-image: url("https://media.dndbeyond.com/compendium-images/components/--right-rules.svg"),url("https://media.dndbeyond.com/compendium-images/components/--left-rules.svg") !important;
				    background-position: left, right !important;
				    background-size: contain !important;
				    background-repeat: no-repeat !important;
				    height: 11px !important;
				    position: absolute !important;
				    z-index: -1;
				}

				.text--rules-sidebar::after {
				    bottom: -13px !important;
				    right: -0.1px !important;
				    left: 0.1px !important;
				}
				.text--rules-sidebar::after {
				    content: '';
				    background-image: url("https://media.dndbeyond.com/compendium-images/components/--right-rules.svg"),url("https://media.dndbeyond.com/compendium-images/components/--left-rules.svg") !important;
				    background-position: left, right !important;
				    background-size: contain !important;
				    background-repeat: no-repeat !important;
				    height: 11px !important;
				    position: absolute !important;
				    z-index: -1;
				    transform: scaleY(-1);
				}
				/* END - New rules sidebar implementation */

				/* START - CSS header variables */
				h1::after {
				    background-color: var(--h1-underline, var(--header-underline, #47D18C));
				}
				h2::after {
				    background-color: var(--h2-underline, var(--header-underline, #47D18C));
				}
				h3::after {
				    background-color: var(--h3-underline, var(--header-underline, #47D18C));
				}
				/* END -  CSS header variables */

				/* START - Underlines compendium links */
				a:not(.ddb-lightbox-outer, h3 > a):hover,
				a:not(.ddb-lightbox-outer, h3 > a):focus {
				    text-decoration: underline;
				}
				/* END - Underlines Compendium links */

				
				/** TEMP new .text--quote-box type for compendium content - needs to be added to compiled **/

				.text--quote-box.compendium-indented-callout-.text--quote-box {
				    background: transparent !important;
				    font-size: 16px !important;
				    border-left: 4px solid #e0dcdc !important;
				    border-right: none !important;
				    padding: 10px 20px !important;
				    margin: 30px 0 !important;
				}

				.text--quote-box.compendium-indented-callout-.text--quote-box::before {
				    content: none !important;
				}

				.text--quote-box.compendium-indented-callout-.text--quote-box::after {
				    content: none !important;
				}  

				/** END TEMP new .text--quote-box type **/

				
				h6 {
				    font-size: 14px !important;
				    font-weight: bold !important;
				}


				h1 {
				    font-size: 32px!important;
				    font-weight: 400!important
				}

				h2 {
				    font-size: 26px!important;
				    font-weight: 400!important;
				    clear: both
				}

				h3 {
				    font-size: 22px!important;
				    font-weight: 400!important;
				    clear: both
				}

				h4 {
				    font-size: 18px!important;
				    font-weight: 700!important
				}

				h5 {
				    font-size: 16px!important;
				    font-weight: 700!important
				}

		
				.rules-text a {
				    color: #129b54!important;
				    transition: .3s
				}

				.rules-text p:first-child {
				    font-size: 16px
				}


				.stat-block-background {
				    background-repeat: no-repeat;
				    -webkit-box-shadow: 0 5px 8px 0 #aaa;
				    -moz-box-shadow: 0 5px 8px 0 #aaa;
				    box-shadow: 0 5px 8px 0 #aaa;
				    background-position: top!important;
				    background-image: url(https://media-stg.dndbeyond.com/compendium-images/tcoe/0gqawlEa2tjXGxpc/mm_statbg_sm.jpg)!important
				}

				.stat-block-background:after,.stat-block-background:before {
				    background-image: url(https://media-stg.dndbeyond.com/compendium-images/cm/c43LH2y2Gcaxb3V2/MMStatBar_lrg.png)!important
				}


				.block-torn-paper,.epigraph,.epigraph--with-author {
				    overflow: auto;
				    background: var(--theme-quote-bg-color,#fff);
				    color: var(--theme-quote-fg-color,#242527);
				    margin: 40px 0;
				    line-height: 1.6;
				    font-size: 14px;
				    border: solid transparent;
				    border-width: 20px 10px;
				    border-image-source: var(--theme-quote-border,url(https://media.dndbeyond.com/ddb-compendium-client/5f1f1d66d16be68cf09d6ca172f8df92.png));
				    border-image-repeat: repeat;
				    border-image-slice: 20 10 20 10 fill;
				    padding: 10px;
				    position: relative
				}

				.epigraph--with-author p:last-child {
				    font-style: italic;
				    text-align: right
				}

				.rules-text {
				    overflow: auto;
				    display: block;
				    margin: 30px 0;
				    line-height: 1.6;
				    font-size: 14px;
				    color: var(--theme-rules-text-fg-color,#242527);
				    border-color: transparent;
				    border-style: solid;
				    border-width: 15px 20px;
				    border-image-repeat: repeat;
				    border-image-slice: 21 30 21 30 fill;
				    background-color: transparent;
				    padding: 20px 10px 10px;
				    position: relative;
				    border-image-source: var(--theme-rules-text-border,url(https://media.dndbeyond.com/ddb-compendium-client/463d4668370589a1a73886611645df7e.png));
				    -webkit-filter: drop-shadow(0 5px 8px #ccc);
				    filter: drop-shadow(0 5px 8px #ccc)
				}

				.rules-text p:first-child {
				    text-transform: uppercase;
				    font-weight: 700
				}

				.read-aloud-text {
				    overflow: auto;
				    display: block;
				    margin: 30px 0;
				    line-height: 1.6;
				    font-size: 14px;
				    color: var(--theme-read-aloud-fg-color,#242527);
				    border: 8px solid transparent;
				    border-image-repeat: repeat;
				    border-image-slice: 8 8 8 8 fill;
				    background-color: transparent;
				    padding: 20px 20px 10px!important;
				    position: relative;
				    border-image-source: var(--theme-read-aloud-border,url(https://media.dndbeyond.com/ddb-compendium-client/146117d0758df55ed5ff299b916e9bd1.png))
				}
				  .custom-stat{
				  	font-weight:bold;
				  	border: 1px dotted #666;
				  }
				  .custom-avghp.custom-stat
			      {

			      	color: #F00;
			      }
			      
			      .custom-hp-roll.custom-stat
			      {
			      	color: #8f03b3;
			      }
			      
			      .custom-initiative.custom-stat{
			      	color: #007900;
			      }
				  
			      .custom-ac.custom-stat{
			      	color: #00F;
			      }
				`,
			save_onsavecallback: function(e) {
				// @todo !IMPORTANT grab the id somewhere from the form, so that you can use this safely
				let note_id = $(this.getElement()).attr('data-note-id');
				self.notes[note_id].text =tinymce.activeEditor.getContent();
				self.notes[note_id].plain=tinymce.activeEditor.getContent({ format: 'text' });
				self.persist();
				if(note_id in window.TOKEN_OBJECTS){
					window.TOKEN_OBJECTS[note_id].place(); // trigger display of the "note" condition
				}
				if(self.notes[note_id].player){
					window.MB.sendMessage('custom/myVTT/note',{
						id: note_id,
						note:self.notes[note_id]
					});
				}
				
			}
		});
				
	}
}


function init_journal(gameid){
	
	["/content/1-0-1688-0/js/tinymce/tiny_mce/tinymce.min.js"].forEach(function(value) {
		var s = document.createElement('script');
		s.src = value;
		(document.head || document.documentElement).appendChild(s);
	});

	["https://www.dndbeyond.com/content/1-0-1697-0/js/tinymce/custom_skin/skin.min.css"].forEach(function(value){
		var l = document.createElement('link');
		
		l.href = value;
		l.rel = "stylesheet";
		(document.head || document.documentElement).appendChild(l);
	});
	
	
	
	window.JOURNAL=new JournalManager(gameid);

	window.JOURNAL.build_journal();
	
	
}

function render_source_chapter_in_iframe(url) {
	const sourceChapter = url.startsWith('https://www.dndbeyond.com/sources/') || url.startsWith('/sources/');
	const compendiumChapter = url.startsWith('https://www.dndbeyond.com/compendium/') || url.startsWith('/compendium/');
	const attachmentChapter = url.startsWith('https://www.dndbeyond.com/attachments/') || url.startsWith('/attachments/');
	const rulesChapter = url.startsWith('https://dndbeyond.com/magic-items') || url.startsWith('https://dndbeyond.com/feats') || url.startsWith('https://dndbeyond.com/spells')
	if (typeof url !== "string" ||  (!sourceChapter && !compendiumChapter && !attachmentChapter && !rulesChapter)) {
		console.error(`render_source_chapter_in_iframe was given an invalid url`, url);
		showError(new Error(`Unable to render a DDB chapter. This url does not appear to be a valid DDB chapter ${url}`));
	}
	const chapterHash = url.split("#")?.[1];
	const iframeId = 'sourceChapterIframe';
	const containerId = `${iframeId}_resizeDrag`;
	const container = find_or_create_generic_draggable_window(containerId, 'Source Book', true, true, `#${iframeId}`);

	let iframe = $(`#${iframeId}`);
	if (iframe.length > 0) {

		// TODO: any clean up tasks before redirecting?

		if (chapterHash) {
			iframe.attr("data-chapter-hash", chapterHash);
		} else {
			iframe.attr("data-chapter-hash", '');
		}

		iframe.attr('src', url);
		return;

	} else {
		iframe = $(`<iframe id=${iframeId}>`);
		if (chapterHash) {
			iframe.attr("data-chapter-hash", chapterHash);
		} else {
			iframe.attr("data-chapter-hash", '');
		}
		iframe.css({
			"display": "block",
			"width": "100%",
			"height": "calc(100% - 15px)",
			"position": "absolute",
			"top": "15px",
			"left": "0"
		});
		container.append(iframe);
	}

	iframe.on("load", function(event) {
		console.log(`render_source_chapter_in_iframe is loading ${this.src}`, $(event.target), this);
		if (!this.src) {
			// it was just created. no need to do anything until it actually loads something
			return;
		}
		$(event.target).contents().find("body[class*='marketplace']").replaceWith($("<div id='noAccessToContent' style='height: 100%;text-align: center;width: 100%;padding: 10px;font-weight: bold;color: #944;'>You do not have access to this content on DndBeyond.</div>"));
		const iframeContents = $(event.target).contents();

		iframeContents.find(".site-bar").hide();
		iframeContents.find("#site-main > header").hide();
		iframeContents.find("#mega-menu-target").hide();
		iframeContents.find(".ad-container").hide();
		iframeContents.find("#site > footer").hide();

		const hash = $(event.target).attr('data-chapter-hash');
		if (hash) {
			const headerId = `#${hash}`;
			const sectionHeader = iframeContents.find(headerId);
			const tagName = sectionHeader.prop("tagName");
			let boundaryTags = [];
			// we are explicitly allowing everything to fall through to the next statement
			// because we want everything that matches tagName and above
			// for example, if tagName is H3, we want our boundaryTags to include H3, H2, and H1
			switch (tagName) {
				case "H4": boundaryTags.push("H4");
				case "H3": boundaryTags.push("H3");
				case "H2": boundaryTags.push("H2");
				case "H1": boundaryTags.push("H1");
			}

			sectionHeader.prevAll().remove();
			boundaryTags.forEach((tag, idx) => {
				const nextHeader = sectionHeader.nextAll(`${tag}:first`);
				nextHeader.nextAll().remove();
				nextHeader.remove();
			});
		}

		$(this).siblings('.sidebar-panel-loading-indicator').remove();
	});

	iframe.attr('src', url);
}
