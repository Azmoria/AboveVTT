/* CharactersPage.js - scripts that are exclusive to the Characters page */

$(function() {
  init_characters_pages();
});

let recentCharacterUpdates = {};

const debounce_add_extras = mydebounce(() => {
  if (is_abovevtt_page()) {
    $('.add-monster-token-to-vtt').remove();
    const extraRows = $('.ct-extra-row')
    for(let i=0; i<extraRows.length; i++){
      $(extraRows[i]).append($(`<button class='add-monster-token-to-vtt'>+</button>`)) 
    }
    let pc = find_pc_by_player_id(my_player_id(), false)
    const playerTokenID = pc ? pc.sheet : '';
    $('.add-monster-token-to-vtt').off('click.addExtra').on('click.addExtra', async function(e){
      e.stopImmediatePropagation();
      let tokenPosition = (window.TOKEN_OBJECTS[playerTokenID]) ? 
        {
          x: parseFloat(window.TOKEN_OBJECTS[playerTokenID].options.left) + parseFloat(window.TOKEN_OBJECTS[playerTokenID].options.size)/2,
          y: parseFloat(window.TOKEN_OBJECTS[playerTokenID].options.top) + parseFloat(window.TOKEN_OBJECTS[playerTokenID].options.size)/2
        } : 
        center_of_view();

      let playerData = await DDBApi.fetchCharacterDetails([window.PLAYER_ID])
      let tokenName = $(this).parent().find('.ddbc-extra-name').text().replace("*", '');
      let monsterData = playerData[0].extras.creatures.filter(d => d.name == tokenName)[0];

      let extraOptions = {
        hitPointInfo: {
          current: $(this).parent().find('.ct-extra-row__hp-value--current').text(),
          maximum: $(this).parent().find('.ct-extra-row__hp-value--total').text(),
        },       
        armorClass: $(this).parent().find('.ct-extra-row__ac').text(),
        sizeId: monsterData.sizeId,
        name: monsterData.name,
        player_owned: true,
        share_vision: true,
        hidden: false,
        locked: false
      }
      if(!window.TOKEN_OBJECTS[playerTokenID])
        tokenPosition = convert_point_from_view_to_map(tokenPosition.x, tokenPosition.y)
      window.MB.sendMessage("custom/myVTT/place-extras-token", {
          monsterData: monsterData,
          centerView: tokenPosition,
          sceneId: window.CURRENT_SCENE_DATA.id,
          extraOptions: extraOptions
      });
    })
  
 
  
  } 

}, 100);

const sendCharacterUpdateEvent = mydebounce(() => {
  if (window.DM) return;
  console.log("sendCharacterUpdateEvent")
  const pcData = {...recentCharacterUpdates};
  recentCharacterUpdates = {};
  if (is_abovevtt_page()) {
    window.MB.sendMessage("custom/myVTT/character-update", {
      characterId: window.PLAYER_ID,
      pcData: pcData
    });
    update_pc_with_data(window.PLAYER_ID, pcData);
  } else {
    tabCommunicationChannel.postMessage({
      msgType: 'CharacterData',
      characterId: window.location.href.split('/').slice(-1)[0],
      pcData: pcData
    });
  }
}, 1500);

/** @param changes {object} the changes that were observed. EX: {hp: 20} */
function character_sheet_changed(changes) {
    console.log("character_sheet_changed", changes);
    recentCharacterUpdates = {...recentCharacterUpdates, ...changes};
    sendCharacterUpdateEvent();
}

function send_character_hp(maxhp) {
  const pc = find_pc_by_player_id(find_currently_open_character_sheet(), false); // use `find_currently_open_character_sheet` in case we're not on CharactersPage for some reason
  if(maxhp > 0){ //the player just died and we are sending removed node max hp data
    character_sheet_changed({
      hitPointInfo: {
        current: 0,
        maximum: maxhp,
        temp: 0
      },
      deathSaveInfo: read_death_save_info()
    });
  }
  else{
    character_sheet_changed({
      hitPointInfo: {
        current: read_current_hp(),
        maximum: read_max_hp(pc?.hitPointInfo?.maximum),
        temp: read_temp_hp()
      },
      deathSaveInfo: read_death_save_info()
    });
  }

}


function read_abilities(container = $(document)) {
  const scoreOnTop = container.find('.ddbc-ability-summary__primary .ddbc-signed-number--large').length === 0;

  let abilitiesObject = [
    {name: 'str', save: 0, score: 0, label: 'Strength', modifier: 0},
    {name: 'dex', save: 0, score: 0, label: 'Dexterity', modifier: 0},
    {name: 'con', save: 0, score: 0, label: 'Constitution', modifier: 0},
    {name: 'int', save: 0, score: 0, label: 'Intelligence', modifier: 0},
    {name: 'wis', save: 0, score: 0, label: 'Wisdom', modifier: 0},
    {name: 'cha', save: 0, score: 0, label: 'Charisma', modifier: 0}
  ];

  for(let i = 0; i < 6; i++){
    if(scoreOnTop){
      abilitiesObject[i].score = parseInt($( container.find(`.ddbc-ability-summary__primary button`)[i] ).text());
    }
    else{
      abilitiesObject[i].score =  parseInt($( container.find(`.ddbc-ability-summary__secondary`)[i] ).text());
    }

    abilitiesObject[i].modifier = parseInt($( container.find(`.ddbc-signed-number--large`)[i] ).attr('aria-label').replace(/\s/g, ''));

    abilitiesObject[i].save = parseInt($( container.find(`.ddbc-saving-throws-summary__ability-modifier .ddbc-signed-number`)[i] ).attr('aria-label').replace(/\s/g, ''));
  }

  return abilitiesObject;
}

function send_abilities() {
   character_sheet_changed({abilities: read_abilities()});
}

function read_senses(container = $(document)) {
  // this seems to be the same for both desktop and mobile layouts which is nice for once
  try {
    let changeData = {};
    const passiveSenses = container.find(".ct-senses__callouts .ct-senses__callout");
    const perception = parseInt($(passiveSenses[0]).find(".ct-senses__callout-value").text());
    if (perception) changeData.passivePerception = perception;
    const investigation = parseInt($(passiveSenses[1]).find(".ct-senses__callout-value").text());
    if (investigation) changeData.passiveInvestigation = investigation;
    const insight = parseInt($(passiveSenses[2]).find(".ct-senses__callout-value").text());
    if (insight) changeData.passiveInsight = insight;
    const senses = container.find(".ct-senses__summary").text().split(",").map(sense => {
      try {
        const name = sense.trim().split(" ")[0].trim();
        const distance = sense.trim().substring(name.length).trim();
        return { name: name, distance: distance };
      } catch (senseError) {
        console.debug("Failed to parse sense", sense, senseError);
        return undefined;
      }
    }).filter(s => s); // filter out any undefined
    if (senses.length > 0) {
      changeData.senses = senses;
    }
    return changeData;
  } catch (error) {
    console.debug("Failed to send senses", error);
    return undefined;
  }
}

function send_senses() {
  const changeData = read_senses();
  if (changeData) {
    character_sheet_changed(changeData);
  }
}

function read_conditions(container = $(document)) {
  let conditionsSet = [];
  container.find(`.ct-condition-manage-pane__condition`).each(function () {
    if ($(this).find(`.ddbc-toggle-field[aria-checked='true']`).length > 0) {
      conditionsSet.push({
        name: $(this).find('.ct-condition-manage-pane__condition-name').text(),
        level: null
      });
    }
  });
  container.find(`.ct-condition-manage-pane__condition--special`).each (function () {
    if(container.find('.ddbc-number-bar__option--active').length > 0){
      conditionsSet.push({
        name: $(this).find('.ct-condition-manage-pane__condition-name').text(),
        level: $(this).find('.ddbc-number-bar__option--implied').length
      });
    }
  })
  return conditionsSet;
}

function read_speeds(container = $(document), speedManagePage) {
  speedManagePage = speedManagePage || container.find(".ct-speed-manage-pane");
  let speeds = [];
  if (speedManagePage.find(".ct-speed-manage-pane__speeds").length > 0) {
    // the sidebar is open, let's grab them all
    speedManagePage.find(".ct-speed-manage-pane__speed").each(function() {
      const container = $(this);
      const name = container.find(".ct-speed-manage-pane__speed-label").text();
      const distance = parseInt(container.find(".ddbc-distance-number__number").text());
      speeds.push({name: name, distance: distance});
    });
    if (speeds.length) {
      return speeds;
    }
  }

  // just update the primary speed
  const name = container.find(".ct-speed-box__heading").text();
  const distance = parseInt( container.find(".ct-speed-box__box-value .ddbc-distance-number .ddbc-distance-number__number").text() ) || 0;
  return [ { name: name, distance: distance } ];
}

function send_movement_speeds(container, speedManagePage) {
  let speeds = read_speeds(container, speedManagePage);
  if (!speeds) {
    return;
  }
  const pc = find_pc_by_player_id(find_currently_open_character_sheet(), false); // use `find_currently_open_character_sheet` in case we're not on CharactersPage for some reason
  if (pc && pc.speeds) {
    pc.speeds.forEach(pcSpeed => {
      const updatedSpeedIndex = speeds.findIndex(us => us.name === pcSpeed.name);
      if (updatedSpeedIndex < 0) { // couldn't read this speed so inject the pc.speeds value
        speeds.push(pcSpeed);
      }
    })
  }
  if (speeds.length > 0) {
    character_sheet_changed({speeds: speeds});
  }
}

function read_current_hp(container = $(document)) {
 
  let element = container.find(`.ct-health-manager__health-item.ct-health-manager__health-item--cur .ct-health-manager__health-item-value`)
  if(element.length){
    return parseInt(element.text())
  }
  element = container.find(`.ct-health-summary__hp-number[aria-labelledby*='ct-health-summary-current-label']`);
  if (element.length) {
    return parseInt(element.text()) || 0;
  }
  element = container.find(`.ct-status-summary-mobile__hp-current`);
  if (element.length) {
    const hpValue = parseInt(element.text()) || 0;
    if (hpValue && container.find(`.ct-status-summary-mobile__hp--has-temp`).length) {
      // DDB doesn't display the temp value on mobile layouts so set this to 1 less, so we can at least show that there is temp hp. See `read_temp_hp` for the other side of this
      if(container.find('.ct-health-manager__health-item--temp').length){
        return hpValue - parseInt(container.find('.ct-health-manager__health-item--temp .ct-health-manager__input').val()); /// if hp side panel is open check this for temp hp
      }
      return hpValue - 1;
    }
    return hpValue;
  }
  return 0;
}

function read_temp_hp(container = $(document)) {
  let element = container.find(`.ct-health-manager__health-item.ct-health-manager__health-item--temp .ct-health-manager__health-item-value input.ct-health-manager__input`)
  if(element.length){
    return parseInt(element.val())
  }
  element = container.find(`.ct-health-summary__hp-number[aria-labelledby*='ct-health-summary-temp-label']`)
  if (element.length) {
    return parseInt(element.text()) || 0;
  }
  if (container.find(`.ct-status-summary-mobile__hp--has-temp`).length) {
    if(container.find('.ct-health-manager__health-item--temp').length){
        return parseInt(('.ct-health-manager__health-item--temp .ct-health-manager__input').val()); // if hp side panel is open check this for temp hp
      }
    // DDB doesn't display the temp value on mobile layouts so just set it to 1, so we can at least show that there is temp hp. See `read_current_hp` for the other side of this
    return 1;
  }
  return 0;
}

function read_max_hp(currentMaxValue = 0, container = $(document)) {
  let element = container.find(`.ct-health-manager__health-item.ct-health-manager__health-item--max .ct-health-manager__health-item-value .ct-health-manager__health-max-current`)
  if(element.length){
    return parseInt(element.text())
  }
  element = container.find(`.ct-health-summary__hp-number[aria-labelledby*='ct-health-summary-max-label']`);
  if (element.length) {
    return parseInt(element.text()) || currentMaxValue;
  }
  element = container.find(".ct-status-summary-mobile__hp-max");
  if (element.length) {
    return parseInt(element.text()) || currentMaxValue;
  }
  return currentMaxValue;
}

function read_death_save_info(container = $(document)) {
  if (container.find(".ct-status-summary-mobile__deathsaves-marks").length) {
    return {
      failCount: container.find('.ct-status-summary-mobile__deathsaves--fail .ct-status-summary-mobile__deathsaves-mark--active').length || 0,
      successCount: container.find('.ct-status-summary-mobile__deathsaves--success .ct-status-summary-mobile__deathsaves-mark--active').length || 0
    };
  }
  return {
    failCount: container.find('.ct-health-summary__deathsaves--fail .ct-health-summary__deathsaves-mark--active').length || 0,
    successCount: container.find('.ct-health-summary__deathsaves--success .ct-health-summary__deathsaves-mark--active').length || 0
  };
}

function read_inspiration(container = $(document)) {
  if (container.find(".ct-inspiration__status--active").length) {
    return true;
  }
  if (container.find(".ct-status-summary-mobile__inspiration .ct-status-summary-mobile__button--active").length) {
    return true
  }
  return false;
}

// Good canidate for service worker
function init_characters_pages(container = $(document)) {
  // this is injected on Main.js when avtt is running. Make sure we set it when avtt is not running
  if (typeof window.EXTENSION_PATH !== "string" || window.EXTENSION_PATH.length <= 1) {
    window.EXTENSION_PATH = container.find("#extensionpath").attr('data-path');
  }

  // it's ok to call both of these, because they will do any clean up they might need and then return early
  init_character_sheet_page();
  init_character_list_page_without_avtt();

  if(!is_abovevtt_page()){
    tabCommunicationChannel.addEventListener ('message', (event) => {
      if(event.data.msgType == 'setupObserver'){
         observe_character_sheet_changes($(document));
        if(event.data.tab == undefined && event.data.rpgRoller != true && window.self==window.top){
          $('.integrated-dice__container').off('click.rpg-roller'); 
        }else{
          convertToRPGRoller();
        }

        window.EXPERIMENTAL_SETTINGS['rpgRoller'] = event.data.rpgRoller;
        if(window.sendToTab != false || event.data.tab == undefined){
            window.sendToTab = (window.self != window.top) ? event.data.iframeTab : event.data.tab;      
        }
      }
      if(event.data.msgType =='removeObserver'){
        $('.integrated-dice__container').off('click.rpg-roller'); 
        delete window.EXPERIMENTAL_SETTINGS['rpgRoller'];
        window.sendToTab = undefined;
        setTimeout(function(){
          tabCommunicationChannel.postMessage({
           msgType: 'isAboveOpen'
          });
        }, 300)
        
      }
      if(event.data.msgType =='disableSendToTab' && window.self == window.top){
        window.sendToTab = undefined;
      }
    })
    tabCommunicationChannel.postMessage({
      msgType: 'isAboveOpen'
    })
    window.diceRoller = new DiceRoller(); 
  }
}

const debounceConvertToRPGRoller =  mydebounce(() => {convertToRPGRoller()}, 1500)


const debounceRemoveRPGRoller =  mydebounce(() => {
    $('.integrated-dice__container').off('click.rpg-roller'); 
    delete window.EXPERIMENTAL_SETTINGS['rpgRoller'];
}, 1500)


function convertToRPGRoller(){
    if(is_abovevtt_page() && window.EXPERIMENTAL_SETTINGS['rpgRoller'] != true){
      $(`.integrated-dice__container:not('.above-aoe')`).off('click.rpg-roller')
      return;
    }
    let urlSplit = window.location.href.split("/");
    if(urlSplit.length > 0) {
      window.PLAYER_ID = urlSplit[urlSplit.length - 1].split('?')[0];
    }
    $(`.integrated-dice__container:not('.above-aoe')`).off('contextmenu.rpg-roller').on('contextmenu.rpg-roller', function(e){
          e.stopPropagation();
          e.preventDefault();
          let rollData = {}
          if($(this).hasClass('avtt-roll-formula-button')){
             rollData = DiceRoll.fromSlashCommand($(this).attr('data-slash-command'))
             rollData.modifier = `${Math.sign(rollData.calculatedConstant) == 1 ? '+' : ''}${rollData.calculatedConstant}`
          }
          else{
             rollData = getRollData(this)
          }
          
          
          if (rollData.rollType === "damage") {
            damage_dice_context_menu(rollData.expression, rollData.modifier, rollData.rollTitle, rollData.rollType, window.PLAYER_NAME, window.PLAYER_IMG)
              .present(e.clientY, e.clientX) // TODO: convert from iframe to main window
          } else {
            standard_dice_context_menu(rollData.expression, rollData.modifier, rollData.rollTitle, rollData.rollType, window.PLAYER_NAME, window.PLAYER_IMG)
              .present(e.clientY, e.clientX) // TODO: convert from iframe to main window
          }
      })
    $(`.integrated-dice__container:not('.above-aoe')`).off('click.rpg-roller').on('click.rpg-roller', function(e){
      e.stopImmediatePropagation();
     
      let rollData = {}

 
      rollData = getRollData(this)
      


      let msgdata = {}
      if(window.EXPERIMENTAL_SETTINGS['rpgRoller'] == true){

        msgdata = {
          player: window.PLAYER_NAME,
          img: window.PLAYER_IMG,
          text: `<div class="tss-24rg5g-DiceResultContainer-Flex" title='${rollData.roll.output.replace(rollData.regExpression, '')}'><div class="tss-kucurx-Result"><div class="tss-3-Other-ref tss-1o65fpw-Line-Title-Other"><span class='aboveDiceOutput'>${rollData.rollTitle}: <span class='abovevtt-roll-${rollData.rollType}'>${rollData.rollType}</span></span></div></div><svg width="1" height="32" class="tss-10y9gcy-Divider"><path fill="currentColor" d="M0 0h1v32H0z"></path></svg><div class="tss-1jo3bnd-TotalContainer-Flex"><div class="tss-3-Other-ref tss-3-Collapsed-ref tss-3-Pending-ref tss-jpjmd5-Total-Other-Collapsed-Pending-Flex"><span class='aboveDiceTotal'>${rollData.roll.total}</span></div></div></div>`,
          whisper: (gamelog_send_to_text() != "Everyone") ? window.PLAYER_NAME : ``,
          rollType: rollData.rollType,
          rollTitle: rollData.rollTitle,
          result: rollData.roll.total,
          playerId: window.PLAYER_ID
        };
      }
      else{
        msgdata = {
          player: window.PLAYER_NAME,
          img: window.PLAYER_IMG,
          whisper: (gamelog_send_to_text() != "Everyone") ? window.PLAYER_NAME : ``,
          playerId: window.PLAYER_ID,
          rollData: rollData,
          sendTo: window.sendToTab 
        };
      }
   
      if(is_abovevtt_page() && window.EXPERIMENTAL_SETTINGS['rpgRoller'] == true){
        window.MB.inject_chat(msgdata);
      }
      else if(!is_abovevtt_page()){
        tabCommunicationChannel.postMessage({
          msgType: 'roll',
          msg: msgdata,
        });
      }

    });
}

function getRollData(rollButton){
    let expression = '';
    if($(rollButton).find('.ddbc-damage__value').length>0){
      expression = $(rollButton).find('.ddbc-damage__value').text().replace(/\s/g, '');
    }
    else if($(rollButton).find('.ddbc-signed-number').length>0){
      expression = `1d20${$(rollButton).find('.ddbc-signed-number').attr('aria-label').replace(/\s/g, '')}`;
    }
    else if($(rollButton).find('.ddbc-healing-icon').length > 0){
      expression = $(rollButton).text().replace(/\s/g, '');
    }
    if($(rollButton).hasClass('avtt-roll-formula-button')){
      expression = DiceRoll.fromSlashCommand($(rollButton).attr('data-slash-command')).expression;
    }
    let roll = new rpgDiceRoller.DiceRoll(expression); 
    let regExpression = new RegExp(`${expression.replace(/[+-]/g, '\\$&')}:\\s`);
    let rollType = 'custom';
    let rollTitle = 'AboveVTT';
    if($(rollButton).parents(`[class*='saving-throws-summary']`).length > 0){
      rollType = 'save'
      rollTitle = $(rollButton).closest(`.ddbc-saving-throws-summary__ability`).find('.ddbc-saving-throws-summary__ability-name abbr').text();
    } else if($(rollButton).parents(`[class*='ability-summary']`).length > 0){
      rollType = 'check'
      rollTitle = $(rollButton).closest(`.ddbc-ability-summary`).find('.ddbc-ability-summary__abbr').text();
    } else if($(rollButton).parents(`[class*='skills__col']`).length > 0){
      rollType = 'skill';
      rollTitle = $(rollButton).closest(`.ct-skills__item`).find('.ct-skills__col--skill').text();
    } else if($(rollButton).parents(`[class*='initiative-box']`).length > 0){
      rollTitle = 'Initiative'
    } else if($(rollButton).parents(`[class*='__damage']`).length > 0){
      rollType = 'damage'
      if($(rollButton).parents(`[class*='damage-effect__healing']`).length > 0){
        rollType = 'heal'
      }
    } else if($(rollButton).parents(`[class*='__tohit']`).length > 0){
      rollType = 'attack'
    } 
    if(rollType == 'damage' || rollType == 'attack' || rollType == 'heal'){
      if($(rollButton).parents(`.ddbc-combat-attack--spell`).length > 0){
        rollTitle = $(rollButton).closest(`.ddbc-combat-attack--spell`).find('.ddbc-spell-name').text();
      }
      else if($(rollButton).parents(`.ct-spells-spell`).length > 0){
        rollTitle = $(rollButton).closest(`.ct-spells-spell`).find('.ddbc-spell-name').text();
      }
      else if($(rollButton).parents(`.ddbc-combat-action-attack-weapon`).length > 0){
        rollTitle = $(rollButton).closest(`.ddbc-combat-action-attack-weapon`).find('.ddbc-action-name').text();
      }
      else if($(rollButton).parents(`.ddbc-combat-attack--item`).length > 0){
        rollTitle = $(rollButton).closest(`.ddbc-combat-attack--item`).find('.ddbc-item-name').text();
      }
    }
    const modifier = (roll.rolls.length > 1 && expression.match(/[+-]\d*$/g, '')) ? `${roll.rolls[roll.rolls.length-2]}${roll.rolls[roll.rolls.length-1]}` : '';

    return {
      roll: roll,
      expression: expression,
      rollType: rollType,
      rollTitle: rollTitle,
      modifier: modifier,
      regExpression: regExpression
    }
}

/** actions to take on the character sheet when AboveVTT is NOT running */
function init_character_sheet_page() {
  if (!is_characters_page()) return;

  // check for name and image
  set_window_name_and_image(function() {
    observe_character_sheet_changes($(document));
    inject_join_exit_abovevtt_button();
    observe_character_theme_change();
    observe_character_image_change();
  });

  // observe window resizing and injeect our join/exit button if necessary
  window.addEventListener('resize', function(event) {
    inject_join_exit_abovevtt_button();
  }); 
}

/** actions to take on the characters list when AboveVTT is NOT running */
function init_character_list_page_without_avtt() {
  if (!is_characters_list_page()) {
    window.location_href_observer?.disconnect();
    delete window.oldHref;
    return;
  }

  inject_join_button_on_character_list_page();

  // observe window.location change. DDB dynamically changes the page when you click the View button instead of navigating to a new page

  window.oldHref = document.location.href;
  if (window.location_href_observer) {
    window.location_href_observer.disconnect();
  }
  window.location_href_observer = new MutationObserver(function(mutationList, observer) {
    if (oldHref !== document.location.href) {
      console.log("Detected location change from", oldHref, "to", document.location.href);
      window.oldHref = document.location.href;
      init_characters_pages();
    }
  });
  window.location_href_observer.observe(document.querySelector("body"), { childList: true, subtree: true });
}

/** Called from our character sheet observer for Dice Roll formulae.
 * @param element the jquery element that we observed changes to */
function inject_dice_roll(element) {
  if (element.find("button.avtt-roll-formula-button").length > 0) {
    console.debug("inject_dice_roll already has a button")
    return;
  }
  const slashCommands = [...element.text().matchAll(multiDiceRollCommandRegex)];
  if (slashCommands.length === 0) return;
  console.debug("inject_dice_roll slashCommands", slashCommands);
  let updatedInnerHtml = element.text();
  for (const command of slashCommands) {
    try {
      const diceRoll = DiceRoll.fromSlashCommand(command[0], window.PLAYER_NAME, window.PLAYER_IMG, "character", window.PLAYER_ID); // TODO: add gamelog_send_to_text() once that's available on the characters page without avtt running
      updatedInnerHtml = updatedInnerHtml.replace(command[0], `<button class='avtt-roll-formula-button integrated-dice__container' title="${diceRoll.action?.toUpperCase() ?? "CUSTOM"}: ${diceRoll.rollType?.toUpperCase() ?? "ROLL"}" data-slash-command="${command[0]}">${diceRoll.expression}</button>`);
    } catch (error) {
      console.warn("inject_dice_roll failed to parse slash command. Removing the command to avoid infinite loop", command, command[0]);
      updatedInnerHtml = updatedInnerHtml.replace(command[0], '');
    }
  }
  element.empty();
  console.debug("inject_dice_roll updatedInnerHtml", updatedInnerHtml);
  element.append(updatedInnerHtml);
  element.find("button.avtt-roll-formula-button").off('click.avttRoll').on('click.avttRoll', function(clickEvent) {
    clickEvent.stopPropagation();
    if(window.sendToTab != undefined)
      return;
    const slashCommand = $(clickEvent.currentTarget).attr("data-slash-command");
    const diceRoll = DiceRoll.fromSlashCommand(slashCommand, window.PLAYER_NAME, window.PLAYER_IMG, "character", window.PLAYER_ID); // TODO: add gamelog_send_to_text() once that's available on the characters page without avtt running
    window.diceRoller.roll(diceRoll);
  });
}

/**
 * Observes character sheet changes and:
 *     injects Dice Roll buttons when a slash command is in item notes.
 *     updates window.PLAYER_NAME when the character name changes.
 * @param {DOMObject} documentToObserve documentToObserve is `$(document)` on the characters page, and `$(event.target).contents()` every where else */
function observe_character_sheet_changes(documentToObserve) {
  if (window.character_sheet_observer) {
    window.character_sheet_observer.disconnect();
  }

  window.character_sheet_observer = new MutationObserver(function(mutationList, observer) {

    // console.log("character_sheet_observer", mutationList);

    // initial injection of our buttons
    const notes = documentToObserve.find(".ddbc-note-components__component:not('.above-vtt-dice-visited')");
    notes.each(function() {
      // console.log("character_sheet_observer iterating", mutationList);
      try {
        inject_dice_roll($(this));
        $(this).addClass("above-vtt-dice-visited"); // make sure we only parse this element once
      } catch (error) {
        console.log("inject_dice_roll failed to process element", error);
      }
    });



    // handle updates to element changes that would strip our buttons
    mutationList.forEach(mutation => {
      try {
        let mutationTarget = $(mutation.target);
        const mutationParent = mutationTarget.parent();

       
        if((!is_abovevtt_page() && window.sendToTab !== undefined) || window.EXPERIMENTAL_SETTINGS['rpgRoller'] == true || window.self != window.top)
          debounceConvertToRPGRoller();
        else
          $('.integrated-dice__container').off('click.rpg-roller');
        
        mutation.removedNodes.forEach(function(removed_node) {
          if($(removed_node).hasClass("ct-game-log-pane")) {
            setTimeout(function() {
              change_sidbar_tab($("#switch_gamelog"), true);
              // deselect the gamelog tab since we're not technically showing the gamelog
              deselect_all_sidebar_tabs();
              $("#switch_gamelog svg").attr("class", "gamelog-button__icon");
            }, 0);
          }
        });


  
        if (mutationTarget.hasClass('ct-sidebar__pane-content') && mutationTarget.find('.ct-creature-pane').length>0) {
          scan_player_creature_pane(mutationTarget);
        }

        if (mutationTarget.closest(".ct-game-log-pane").length == 0 && mutationTarget.find(".ct-sidebar__header").length > 0 && mutationTarget.find(".ddbc-html-content").length > 0 && mutationTarget.find("#castbutton").length == 0) {
          // we explicitly don't want this to happen in `.ct-game-log-pane` because otherwise it will happen to the injected gamelog messages that we're trying to send here
          if(is_abovevtt_page() || window.sendToTab != undefined){
            if(mutationTarget.hasClass('ct-sidebar__pane-content')){
              inject_sidebar_send_to_gamelog_button(mutationTarget.children('div:last-of-type'));
            }else{
              inject_sidebar_send_to_gamelog_button(mutationTarget.find('.ct-sidebar__pane-content>div:last-of-type'));
            }
            
          }
        }
         

        if(is_abovevtt_page()){
           
            // console.log(`sidebar inserted: ${event.target.classList}`);
          if (mutationTarget.hasClass('ct-sidebar__pane-content')){
             // The user clicked on something that shows details. Open the sidebar and show it
            show_sidebar();
        
          }
            
          if (mutationTarget.find(".ct-game-log-pane").length>0) {
            inject_chat_buttons();
            window.MB.reprocess_chat_message_history();
          }

        
          if(mutationTarget.hasClass("ddbc-tab-list__content")){
            if (!is_player_sheet_full_width()) {
              $(".ct-primary-box").css({ "height": "610px" });
              $(".ddbc-tab-options__content").css({ "height": "510px" });
              // these need a little more space due to the filter search bar
              $(".ct-extras").css({ "height": "540px" });
              $(".ct-equipment").css({ "height": "540px" });
              $(".ct-spells").css({ "height": "540px" });
            }  
          }
        }


        switch (mutation.type) {
          case "attributes":
            if (
              (mutationParent.hasClass('ct-condition-manage-pane__condition-toggle') && mutationTarget.hasClass('ddbc-toggle-field')) ||
              (mutationTarget.hasClass('ddbc-number-bar__option--interactive') && mutationTarget.parents('.ct-condition-manage-pane__condition--special').length>0)
            ) { // conditions update from sidebar
              const conditionsSet = read_conditions(documentToObserve);
              character_sheet_changed({conditions: conditionsSet});
            } else if(
              mutationTarget.hasClass("ct-health-summary__deathsaves-mark") ||
              mutationTarget.hasClass("ct-health-manager__input") ||
              mutationTarget.hasClass('ct-status-summary-mobile__deathsaves-mark')
            ) {
              send_character_hp();
            } else if (mutationTarget.hasClass("ct-subsection--senses")) {
              send_senses();
            } else if (mutationTarget.hasClass("ct-status-summary-mobile__button--interactive") && mutationTarget.text() === "Inspiration") {
              character_sheet_changed({inspiration: mutationTarget.hasClass("ct-status-summary-mobile__button--active")});
            } else if(mutationParent.find('[class*="ct-extras"]').length>0 && mutationParent.find('.add-monster-token-to-vtt').length==0){
              debounce_add_extras();
            }

            break;
          case "childList":
            const firstRemoved = $(mutation.removedNodes[0]);
            if(firstRemoved.hasClass('ct-health-summary__hp-item') && firstRemoved.children('#ct-health-summary-max-label').length){ // this is to catch if the player just died look at the removed node to get value - to prevent 0/0 hp
              let maxhp = parseInt(firstRemoved.find(`.ct-health-summary__hp-number`).text());
              send_character_hp(maxhp);
            }else if (
              ($(mutation.addedNodes[0]).hasClass('ct-health-summary__hp-number')) ||
              (firstRemoved.hasClass('ct-health-summary__hp-item-input') && mutationTarget.hasClass('ct-health-summary__hp-item-content')) ||
              (firstRemoved.hasClass('ct-health-summary__deathsaves-label') && mutationTarget.hasClass('ct-health-summary__hp-item')) ||
              mutationTarget.hasClass('ct-health-summary__deathsaves') ||
              mutationTarget.hasClass('ct-health-summary__deathsaves-mark')
            ) {
              send_character_hp();
            }
            else if(mutationTarget.hasClass('ct-inspiration__status')) {
              character_sheet_changed({
                inspiration: mutationTarget.hasClass('ct-inspiration__status--active')
              });
            } else if (mutationTarget.hasClass("ct-sense-manage-pane__senses")) {
              send_senses();
            } else if (mutationTarget.hasClass("ct-speed-manage-pane")) {
              send_movement_speeds(documentToObserve, mutationTarget);
            } else if($(mutation.addedNodes[0]).hasClass('ct-extra-row') || ($(mutation.addedNodes[0]).hasClass('ct-content-group') && $('.ct-extra-row').length>0)){
              debounce_add_extras();
            }

            // TODO: check for class or something. We don't need to do this on every mutation
            mutation.addedNodes.forEach(node => {
              if (typeof node.data === "string" && node.data.match(multiDiceRollCommandRegex)?.[0]) {
                try {
                  inject_dice_roll(mutationTarget);
                } catch (error) {
                  console.log("inject_dice_roll failed to process element", error);
                }
              }
            });
            if (mutationTarget.hasClass("ct-sidebar__pane-content")) {
              mutation.removedNodes.forEach(node => {
                if ($(node).hasClass("ct-speed-manage-pane")) {
                  // they just closed the movement speed sidebar panel so
                  send_movement_speeds(documentToObserve, $(node));
                }
              });
            }
            break;
          case "characterData":

              if (mutationParent.parent().hasClass('ct-health-summary__hp-item-content') ||
                mutationParent.hasClass("ct-health-manager__health-item-value") 
              ) {
                send_character_hp();          
              } else if (mutationParent.hasClass('ddbc-armor-class-box__value')) { // ac update from sidebar
                character_sheet_changed({armorClass: parseInt(documentToObserve.find(`.ddbc-armor-class-box__value`).text())});
              }
              else if ($(mutationTarget[0].nextElementSibling).hasClass('ct-armor-manage-pane__heading-extra')) {
                character_sheet_changed({armorClass: parseInt(mutationTarget[0].data)});
              }
              else if(mutationTarget.parents('.ddbc-ability-summary').length>0 || 
                mutationTarget.parents('.ddbc-saving-throws-summary__ability-modifier').length>0
              ){
                send_abilities();
              }
            if (typeof mutation.target.data === "string") {
              if (mutation.target.data.match(multiDiceRollCommandRegex)?.[0]) {
                try {
                  inject_dice_roll(mutationTarget);
                } catch (error) {
                  console.log("inject_dice_roll failed to process element", error);
                }
              } else if (mutation.target.parentElement.classList.contains("ddb-character-app-sn0l9p")) {
                window.PLAYER_NAME = mutation.target.data;
                character_sheet_changed({name: mutation.target.data});
              }
            }
            break;
        }
      } catch (error) {
        console.warn("character_sheet_observer failed to parse mutation", error, mutation);
      }
    });
  });

  const mutation_target = documentToObserve.get(0);
  const mutation_config = { attributes: true, childList: true, characterData: true, subtree: true };
  window.character_sheet_observer.observe(mutation_target, mutation_config);
}

/** Attempts to read the player name and image from the page every.
 * This will retry every second until it successfully reads from the page
 * @param {function} callback a function to execute after player name and image have been read from the page */
function set_window_name_and_image(callback) {
  if (!is_characters_page()) return;
  if (window.set_window_name_and_image_attempts > 30) {
    console.warn(`set_window_name_and_image has failed after 30 attempts. window.PLAYER_NAME: ${window.PLAYER_NAME}, window.PLAYER_IMG: ${window.PLAYER_IMG}`);
    delete window.set_window_name_and_image_attempts;
    if (is_abovevtt_page()) {
      showErrorMessage(
        new Error("set_window_name_and_image has failed after 30 attempts"),
        "This can happen if your character is not finished yet. Please make sure your character is finished. If your character is finished, try the following",
        ``,
        `Navigate to the <a href="${window.location.href.replace(window.location.search, '')}/builder/home/basic" target="_blank">Edit Character</a> page`,
        `&nbsp;&nbsp;&nbsp;&nbsp;1. change the avatar image`,
        `&nbsp;&nbsp;&nbsp;&nbsp;2. enable homebrew`,
        `&nbsp;&nbsp;&nbsp;&nbsp;3. make your character public`,
        `&nbsp;&nbsp;&nbsp;&nbsp;4. make sure your character is finished, and save your character`,
        '',
        "After you save your character, you can change the avatar image back to what it was before."
      );
    }
    return;
  }

  console.debug("set_window_name_and_image");

  window.PLAYER_NAME = $(".ddb-character-app-sn0l9p").text();
  try {
    // This should be just fine, but catch any parsing errors just in case
    window.PLAYER_IMG = get_higher_res_url($(".ddbc-character-avatar__portrait").css("background-image").slice(4, -1).replace(/"/g, "")) || defaultAvatarUrl;
  } catch {}

  if (typeof window.PLAYER_NAME !== "string" || window.PLAYER_NAME.length <= 1 || typeof window.PLAYER_IMG !== "string" || window.PLAYER_IMG.length <= 1) {
    // try again
    if (!window.set_window_name_and_image_attempts) {
      window.set_window_name_and_image_attempts = 1;
    }
    window.set_window_name_and_image_attempts += 1
    setTimeout(function() {
      set_window_name_and_image(callback);
    }, 1000);
  } else {
    // we're done
    if (typeof callback === "function") {
      callback();
    }
    delete window.set_window_name_and_image_attempts;
  }
}

/** Adds a button to the character sheet.
 * If AboveVTT is not running, the button will be a join button
 * If AboveVTT is running, the button will be an exit button */
function inject_join_exit_abovevtt_button() {
  if (!is_characters_page() || window.self != window.top) return; // wrong page, dude
  if ($(".ddbc-campaign-summary").length === 0) return;     // we don't have any campaign data
  if ($("#avtt-character-join-button").length > 0) return;  // we already injected a button

  const desktopPosition = $(".ct-character-sheet-desktop > .ct-character-header-desktop > .ct-character-header-desktop__group--gap");
  const tabletPosition = $(".ct-character-sheet-tablet .ct-main-tablet > .ct-main-tablet__campaign");
  const mobilePosition = $(".ct-character-sheet-mobile .ct-main-mobile > .ct-main-mobile__campaign");

  const buttonText = is_abovevtt_page() ? "Exit AboveVTT" : "Join AboveVTT";
  const button = $(`<a id="avtt-character-join-button" class="ct-character-header-desktop__button" style="float:right;"><img style="height:18px;" src="${window.EXTENSION_PATH + "assets/avtt-logo.png"}" title="AboveVTT Logo" />${buttonText}</a>`);

  if (desktopPosition.length > 0) {
    desktopPosition.append(button);
    button.css({
      "color": "white"
    });
  } else if (tabletPosition.length > 0) {
    tabletPosition.prepend(button);
    if (tabletPosition.hasClass("ct-main-tablet__campaign--dark-mode")) {
      button.css({"color": "white", "background": "rgba(16,22,26,.859)"});
    } else {
      button.css({"background": "white"});
    }
  } else if (mobilePosition.length > 0) {
    mobilePosition.prepend(button);
    if (mobilePosition.hasClass("ct-main-mobile__campaign--dark-mode")) {
      button.css({"color": "white", "background": "rgba(16,22,26,.859)"});
    } else {
      button.css({"background": "white"});
    }
  }

  button.click(function(event) {
    if (is_abovevtt_page()) {
      window.location.href = `${window.location.origin}${window.location.pathname}`;
    } else {
      window.location.href = `${window.location.origin}${window.location.pathname}?abovevtt=true`;
    }
  });
}

function inject_join_button_on_character_list_page() {
  if (!is_characters_list_page()) return;
  if (!window.inject_join_button_on_character_list_page_attempts) {
    window.inject_join_button_on_character_list_page_attempts = 1;
  }
  if (window.inject_join_button_on_character_list_page_attempts > 30) {
    console.warn("inject_join_button_on_character_list_page gave up after 30 attempts");
    return;
  }

  const list = $(".ddb-characters-listing-body");
  if (list.length === 0) {
    // not loaded yet. Try again in 1 second
    window.inject_join_button_on_character_list_page_attempts += 1;
    setTimeout(function() {
      inject_join_button_on_character_list_page();
    }, 1000);
    return;
  }
  delete window.inject_join_button_on_character_list_page_attempts

  // const characterCards = list.find(".ddb-campaigns-character-card-campaign-links-campaign-link");
  const characterCards = list.find(".ddb-campaigns-character-card-campaign-links");
  characterCards.each((_, campaignLink) => {
    const cardFooter = $(campaignLink).siblings(".ddb-campaigns-character-card-footer").find(".ddb-campaigns-character-card-footer-links");
    const joinButton = $(`<a href='#' class='button ddb-campaigns-character-card-footer-links-item' style='color:white;background: #1b9af0;text-align: center;border-radius: 2px;box-shadow: inset 0 1px 0 rgb(255 255 255 / 10%), 0 1px 2px rgb(0 0 0 / 5%);background-repeat: repeat-x;border: 1px solid #070707;border-color: rgba(0,0,0,0.1) rgba(0,0,0,0.1) rgba(0,0,0,0.25);margin-top: 5px;padding-left: 4px;padding-right: 4px;'>JOIN AboveVTT</a>`);
    cardFooter.prepend(joinButton);
    joinButton.click(function(e) {
      e.preventDefault();
      let sheet;
      const thisButton = $(e.currentTarget);
      const thisButtonSiblings = $(e.currentTarget).siblings("a");
      thisButtonSiblings.each((_, siblingAnchor) => {
        if (!sheet) { // look for the "View" link, and grab the href value of it
          sheet = siblingAnchor.href.match(charactersPageRegex)?.[0];
        }
      });
      if (sheet) {
        window.open(`https://www.dndbeyond.com${sheet}?abovevtt=true`, '_blank');
      } else {
        showError(new Error("Failed to find the View link"), "thisButton:", thisButton, ", thisButtonSiblings:", thisButtonSiblings, "clickEvent:", e);
      }
    });
  });
}

function observe_character_theme_change() {
  if (window.theme_observer) window.theme_observer.disconnect();
  window.theme_observer = new MutationObserver(function(mutationList, observer) {
    // console.log("theme_observer mutationList", mutationList);
    mutationList.forEach(mutation => {
      // console.log("theme_observer mutation", mutation, mutation.addedNodes, mutation.addedNodes.length);
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          // console.log("theme_observer node", node);
          if (node.innerHTML && node.innerHTML.includes("--dice-color")) {
            // console.log("theme_observer is calling find_and_set_player_color", mutation, node);
            const newColor = node.innerHTML.match(/#(?:[0-9a-fA-F]{3}){1,2}/)?.[0];
            if (newColor) {
              update_window_color(newColor);
              if(window.PeerManager != undefined)
                window.PeerManager.send(PeerEvent.preferencesChange());
              character_sheet_changed({
                decorations: {
                  characterTheme:{ 
                    themeColor: newColor
                  }
                }
              });
            }
          }
        });
      }
    });
  });
  window.theme_observer.observe(document.documentElement, { childList: true });
}

function observe_character_image_change() {
  if (window.character_image_observer) window.character_image_observer.disconnect();
  window.character_image_observer = new MutationObserver(function(mutationList, observer) {
    mutationList.forEach(mutation => {
      try {
        // This should be just fine, but catch any parsing errors just in case
        const updatedUrl = get_higher_res_url($(mutation.target).css("background-image").slice(4, -1).replace(/"/g, ""));
        window.PLAYER_IMG = updatedUrl;
        character_sheet_changed({image: updatedUrl,
                                avatarUrl: updatedUrl});
      } catch { }
    });
  });
  window.character_image_observer.observe(document.querySelector(".ddbc-character-avatar__portrait"), { attributeFilter: ["style"] });
}

function update_window_color(colorValue) {
  let pc = find_pc_by_player_id(my_player_id(), false);
  if (pc?.decorations?.characterTheme?.themeColor) {
    pc.decorations.characterTheme.themeColor = colorValue;
    find_and_set_player_color();
  }
}

function read_pc_object_from_character_sheet(playerId, container = $(document)) {
  if (!is_abovevtt_page()) {
    // window.CAMPAIGN_INFO is defined in Startup.js
    console.warn("read_pc_object_from_character_sheet is currently only supported when AVTT is running");
    return undefined
  }
  if (!playerId || !container || container.length === 0) {
    console.warn("read_pc_object_from_character_sheet expected a playerId and container, but received", playerId, container);
    return undefined;
  }
  let pc = find_pc_by_player_id(playerId, true); // allow a default object here. We're about to overwrite most of it anyway

  try {
    pc.abilities = read_abilities(container);
    pc.armorClass = parseInt(container.find(`.ddbc-armor-class-box__value`).text()) || parseInt(container.find(".ct-combat-mobile__extra--ac .ct-combat-mobile__extra-value").text()) || 0;
    pc.campaign = window.CAMPAIGN_INFO;
    pc.characterId = playerId;
    pc.conditions = read_conditions(container);
    pc.deathSaveInfo = read_death_save_info(container);
    // TODO: figure out how to read decorations
    pc.hitPointInfo = {
      current: read_current_hp(container),
      maximum: read_max_hp(pc?.hitPointInfo?.maximum, container),
      temp: read_temp_hp(container)
    };
    // TODO: immunities?
    // TODO: initiativeBonus?
    pc.inspiration = read_inspiration(container);
    pc.name = container.find(".ddb-character-app-sn0l9p").text();
    const pb = parseInt(container.find(".ct-proficiency-bonus-box__value").text());
    if (pb) {
      pc.proficiencyBonus = pb;
    }
    let readSpeeds = read_speeds(container) || [];
    if (readSpeeds) {
      pc.speeds?.forEach(pcSpeed => {
        const updatedSpeedIndex = readSpeeds.findIndex(us => us.name === pcSpeed.name);
        if (updatedSpeedIndex < 0) { // couldn't read this speed so inject the pc.speeds value
          readSpeeds.push(pcSpeed);
        }
      })
    }
    pc = {...pc, ...read_senses(container)};
  } catch (error) {
    console.error("read_pc_object_from_character_sheet caught an error", error);
  }
  update_pc_with_data(playerId, pc);
  return pc;
}
