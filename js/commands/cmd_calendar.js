
const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;

const DateFromTimeZone= require('../utils').DateFromTimeZone;
const identifyEmoji= require('../utils').identifyEmoji;


const fs= require( 'fs' );
const path= require( 'path' );

const google = require('googleapis');

const cron= require('node-cron');




const G_AUTH_URL_CALENDAR= 'https://www.googleapis.com/auth/calendar'

const G_SERVICE_ACCOUNT_FILEPATH= "./calendar/keyfile.json"

let G_MAIL_REGEX= /^[a-z0-9](\.?[a-z0-9]){5,}@g(oogle)?mail\.com$/

const DEFAULT_TIMEZONE= "Europe/Paris"


let hereLog= (...args) => {console.log("[cmd_calendar]", ...args);};


function __isDateValid(date){
    return (date instanceof Date) && !isNaN(date.getTime())
}


function __g_authentication(g_auth_obj){
    return new Promise((resolve, reject) =>{
        if (!(Boolean(g_auth_obj) && Boolean(g_auth_obj.client_email) && Boolean(g_auth_obj.private_key))) reject("wtf, invalid auth_obj?!")

        let jwtClient = new google.google.auth.JWT(
            g_auth_obj.client_email,
            null,
            g_auth_obj.private_key,
            [G_AUTH_URL_CALENDAR]
        );

        jwtClient.authorize(function (err, tokens) {
            if (err) {
                reject(err);
                return;
            } else {
                resolve(jwtClient)
            }
        });
    })
}

async function _request_JWTClient(){
    return new Promise((reject, resolve) => {
        var fn= path.resolve(__dirname, G_SERVICE_ACCOUNT_FILEPATH)
        if(fs.existsSync(fn)){
            var data= fs.readFileSync(fn);

            var r= undefined;
            try{
                if(Boolean(data) && Boolean(r=JSON.parse(data))){
                    __g_authentication(data).then((jwtClient) => {
                        resolve(jwtClient)
                    }).catch(err => {
                        reject(`Error authenticating: ${err}`)
                    })
                }
                else{
                    reject(`Error reading data from '${G_SERVICE_ACCOUNT_FILEPATH}'`);
                }
            }
            catch(err){
                reject(`Error while parsing data from '${G_SERVICE_ACCOUNT_FILEPATH}' - ${err}`)
            }
        }
    })
}

function _request_calendarEventsInfos(cal_id, monthsBack=6){
    var dateMin= new Date()
    dateMin.setMonth(dateMin.getMonth()-monthsBack)

    return new Promise( (resolve, reject) =>{
        _request_JWTClient().then((jwtClient) => {
            let calendar = google.google.calendar('v3');
            calendar.events.list(
                {
                    auth: jwtClient,
                    calendarId: cal_id,
                    orderBy: 'startTime',
                    singleEvents: true,
                    timeMin: minDate
                },
                function (err, response) {
                    if (err) {
                        reject(`Error while fetching calendar events: ${err}`);
                    }
                    else{
                        resolve(response);
                    }
                }
            );
        }).catch(err => {
            reject(err)
        })
    })
}



async function _checkCalendarUpdate(guild, utils){
    hereLog(`checking calendar updates for guild "${guild.name}"…`)

    //something, something _update_calendar_channel
    var calendars_obj= utils.settings.get(guild, 'calendars')
    var update_check= utils.settings.get(guild,'update_check')
    update_check= (!Boolean(update_check))?{}:update_check

    if (Boolean(calendars_obj)){
        for (var cal_id in Object.keys(calendars_obj)){
            var channel_object= undefined
            if(Boolean(channel_object=calendars_obj[cal_id])){
                var events= (await _request_calendarEventsInfos(calendar_id))
                if ((!Boolean(events)) || (!Boolean(events.data))){
                    hereLog(`[update_calendar]{${calendar_id}} bad fetch of events for calendar '${calendar_id}'`)
                    break
                }
                else if(
                    (!Boolean(update_check[cal_id])) ||
                    (Boolean(events.data.updated) && ((!Boolean(update_check[cal_id].next)) || (new Date(events.data.updated)).getTime()>update_check[cal_id].lastTime) )
                ){
                    for (var ch_id in Object.keys(channel_object)){
                        var channel= undefined
                        if (Boolean(ch_id) && Boolean(channel=guild.channels.cache.get(ch_id))){
                            var l_msg_id= (Boolean(channel_object[ch_id]))? channel_object[ch_id] : []
                            var _t= (await _update_calendar_channel(calendar_id, channel, l_msg_id, events))

                            if(_t) update_check[cal_id]['lastTime']= Date.now()
                            update_check[cal_id]['unnecessary']= _t
                        }
                        else{
                            hereLog(`[update] error while updating calendar '${calendar_id}': bad channel id given ${ch_id}`)
                        }
                    }
                }
            }
        }

        utils.settings.set(guild,'update_check',update_check)
    }
}


var updateCal_job= undefined

function cmd_init(utils){
    if(!Boolean(updateCal_job)){
        updateCal_job= cron.schedule('42 * * * *', () =>{
            var bot= utils.getBotClient()
            bot.cache.guilds.each(guild => {
                _checkCalendarUpdate(guild, utils)
            })
        });
    }
}


async function cmd_init_per_guild(utils, guild){
    var calendars_object= utils.settings.get(guild, 'calendars')
    var update_check= utils.settings.get(guild,'update_check')
    var b_updating= false
    if(Boolean(calendars_object)){
        for (var cal_id in Object.keys(calendars_object)){
            var chan_obj= calendars_object[cal_id]
            if(Boolean(chan_obj)){
                for (var chan_id in Object.keys(chan_obj)){
                    var channel= undefined
                    if(Boolean(channel=guild.channels.cache.get(chan_id))){
                        var msg_obj= chan_obj[chan_id]
                        if(Boolean(msg_obj)){
                            for (var msg_id in msg_obj){
                                if (Boolean(msg_id)){
                                    var message= undefined
                                    try{
                                        var message= (await channel.messages.fetch(msg_id))
                                    }
                                    catch(err){
                                        hereLog(`[init_per_guild] couldn't fetch msg (${msg_id})`)
                                        message= undefined
                                    }
                                    
                                    if(!Boolean(message)){
                                        update_check[cal_id]['unnecessary']= false
                                        b_updating= true
                                    }
                                }
                            }
                        }
                    }
                    else{
                        delete chan_obj[chan_id]
                    }
                }
            }
        }

        utils.settings.set(guild, 'update_check', update_check)
        utils.settings.set(channel.guild, 'calendars', calendars_object)

        if(b_updating){
            _checkCalendarUpdate(guild, utils)
        }
    }
}



function ___metaTextInfoFromDescription(descriptionText){
    var descInfo_Obj= {text: undefined}
    if(!(Boolean(descriptionText) && descriptionText.length>0)){
        return descInfo_Obj
    }

    var lines= descriptionText.split('\n')
    var _tags= lines[0].split(/\s+/), _stop_tags= (-1)
    var tags= _tags.filter( (elem, idx) => {
        if(_stop_tags>=0 || elem.startsWith("#")){
            _stop_tags= (_stop_tags<0)?idx : _stop_tags
            return false
        }
        else{
            return true
        }
    })

    descInfo_Obj.tags= tags
    descInfo_Obj.text= lines.slice(1).join('\n')
    if(_stop_tags>0){
        var lastTag= _tags[_stop_tags-1]
        var new_fLine= (lines[0].slice(lines[0].indexOf(lastTag)).replace(/^\s+/,'')) + descInfo_Obj.text
        if (new_fLine.length>0){
            descInfo_Obj.text= new_fLine+descInfo_Obj.text
        }
    }

    return descInfo_Obj
}

function ___getEmoteBulletFromTagList(tagList, bulletTagDict, defaultBullet='🔵'){
    var r= defaultBullet
    for (var tag in tagList){
        var _b= bulletTagDict[tag]
        if (Boolean(_b) && _b.length>0){
            r= _b
        }
    }

    return r
}

function ___getCategoryFromTagList(tagList, catList){
    if (catList.length<=0){
        return "unknown"
    }

    for (var tag in tagList){
        if (catList.includes(tag)){
            return tag
        }
    }

    return "unknown"
}

function __textCatObj_fromEventItem(guild, utils, event_item, eventTimezone=DEFAULT_TIMEZONE, displayTimezone=DEFAULT_TIMEZONE){
    var txt_title= undefined
    if (!(Boolean(txt_title=event_item.summary) && title.length>0)){
        hereLog("[event_to_text] item without title?")
        return undefined
    }


    let __getDate = (field='start') => {
        var strDate= undefined
        var date= undefined
        if ( Boolean(event_item[field]) && Boolean(strDate=event_item[field].date) && strDate.length>0
                && __isDateValid(new Date(strDate))
        ){
            date= DateFromTimeZone(strDate, eventTimezone)
        }
        else if ( !(Boolean(event_item[field]) && Boolean(strDate=event_item[field].dateTime) && strDate.length>0
            && __isDateValid(date=(new Date(strDate)))) )
        {
            hereLog(`[event_to_text] bad or no '${field}' date (${txt_title} - ${strDate})`)
            date= undefined
        }

        return date
    }
    var startDate= __getDate()
    if(!Boolean(startDate)) return undefined;

    var endDate= __getDate('end')
    if(Boolean(endDate)){
        let HourTime= 3600000
        let DayTime= 24*HourTime

        var timeHourDiff= Math.floor((endDate.getTime()-startDate.getTime())/HourTime)
        if(timeHourDiff>=12){
            var d_rx= /^([0-9]{2})\/[0-9]{2}\/[0-9]{4}\,\s*([0-9]{2})\:[0-9]{2}\:[0-9]{2}$/
            var startDateRegexGroup= (startDate.toLocaleString('fr-Fr',{timeZone: displayTimezone})).match(d_rx)
            var endDateRegexGroup= (endDate.toLocaleString('fr-Fr',{timeZone: displayTimezone})).match(d_rx)
            if(  (timeHourDiff>=24) || 
                (Boolean(startDateRegexGroup) && Boolean(endDateRegexGroup) &&
                    startDateRegexGroup[1]!==endDateRegexGroup[1]
                )
            ){
                var n= 0
                if((Number(endDateRegexGroup[2])<6)){
                    var endMinusOneDay_date= new Date(endDate.getTime()-DayTime)
                    var emodRegexGroup= (endMinusOneDay_date.toLocaleString('fr-Fr',{timeZone: displayTimezone})).match(d_rx)
                    if(startDateRegexGroup[1]===emodRegexGroup[1]){
                        endDate= undefined
                    }
                    else{
                        var t=0
                        endDate= new Date((t=endDate.getTime())-(t%DayTime)-1)
                    }
                }
            }
            else{
                endDate= undefined
            }
        }
    }
    var dateTxt= `${startDate.toLocaleDateString('fr-Fr',{timeZone: displayTimezone})}${(Boolean(endDate))?` - ${endDate.toLocaleDateString('fr-Fr',{timeZone: displayTimezone})}`:''}`

    var descInfo= ___metaTextInfoFromDescription(event_item.description)

    var txt_eventItemBullet= '🔵'
    if(Boolean(descInfo.tags) && descInfo.tags.length>0){
        var tagsDict= utils.settings.get(guild, 'tags')
        if(!Boolean(tagsDict)) tagsDict= {};
        txt_eventItemBullet= ___getEmoteBulletFromTagList(descInfo.tags, tagsDict)
    }

    var resp= `${txt_eventItemBullet} - [ ${dateTxt} ] : ${title}`
    if(Boolean(descInfo.text) && descInfo.text.length>0){
        resp+= `\n> ${descInfo.text.replaceAll('\n','\n> ')}`
    }

    var cat= "unknown"
    var _usedDate= (Boolean(endDate))? endDate : startDate
    var _tmpDate= new Date(_usedDate.getTime()-(_usedDate.getTime()%DayTime))
    if((Date.now()-_tmpDate.getTime())>DayTime){
        cat= "outdated"
    }
    else if(Boolean(descInfo.text) && descInfo.text.length>0){
        var catList= utils.settings.get(guild, 'categories')
        if(!Boolean(catList)) catList=[];
        cat= ___getCategoryFromTagList(descInfo.tags, catList)
    }
    
    
    return {text: resp, category: cat};
}

async function _update_calendar_channel(calendar_id, channel, utils, message_id_list, cal_events){
    for (var msg_id in message_id_list){
        var message= undefined
        try{
            if(Boolean(msg_id) && Boolean(message=(await (channel.messages.fetch(msg_id))))){
                await message.delete()
            }
        }
        catch (err){
            hereLog(`[update_calendar_channel]{${calendar_id}, ${channel}} error while deleting message ${msg_id} - ${err}`)
        }
    }

    if(Boolean(cal_events) && Boolean(cal_events.data) && Boolean(cal_events.data.items) && cal_events.data.items.length>0){
        var resp= ""
        var foundCategories= []
        var l_txtCatObj= []
        for (var event_item in cal_events.items){
            var obj= __textCatObj_fromEventItem(channel.guild, utils, event_item)
            if (Boolean(obj) && Boolean(obj.text) && Boolean(obj.text.length)){
                l_txtCatObj.push(obj)

                var cat= (Boolean(obj.category))?obj.category:"unknown"
                if(!foundCategories.includes(cat)){
                    foundCategories.push(cat)
                }
            }
        }
        if (l_txtCatObj.length>0){
            var i= -1
            if((i=foundCategories.indexOf('unknown'))>0){
                foundCategories.splice(i,1)
                foundCategories= [ 'unknown' ].concat(foundCategories)
            }
            else if(foundCategories.length===0){
                foundCategories.push('unknown')
            }
            else if(foundCategories.indexOf('outdated')>0){
                foundCategories.splice(i,1)
                foundCategories= foundCategories.concat([ 'outdated' ])
            }

            for (var cat in foundCategories){
                resp+= `#**${(cat==='unknown')?"Divers":((cat==="outdated")?"Terminé":cat)}** :\n\n`
                
                var l_events= l_txtCatObj.filter(obj => {return (Boolean(obj) && obj.category===cat)})
                for (var ev in l_events){
                    resp+= `\t${ev}\n\n`
                }
            }

            try{
                var sentMsg= (await channel.send(resp, {split: true}))
                if(Boolean(sentMsg)){
                    var newMsgList= []
                    if(Array.isArray(sentMsg)){
                        newMsgList= sentMsg.map((msg) => {return msg.id})
                    }
                    else{
                        newMsgList.push(sentMsg.id)
                    }

                    var calendars_obj= utils.settings.get(guild, 'calendars')
                    var channel_object= undefined
                    if(Boolean(calendars_obj) && Boolean(channel_object=(calendars_obj[calendar_id]))){
                        channel_object[channel.id]= newMsgList
                        utils.settings.set(guild, 'calendars',channel_object)
                    }
                    else{
                        hereLog(`[update_calendar_channel]{${calendar_id}, ${channel}} - Critical ERROR: can't find channel object!`)
                    }
                }
                else{
                    hereLog(`[update_calendar_channel]{${calendar_id}, ${channel}} - problem while sending new message: no message object?!`)
                    return false
                }
            }
            catch(err){
                hereLog(`[update_calendar_channel]{${calendar_id}, ${channel}} - error occured during message sending? ${err}`)
                return false
            }


            return true
        }
    }
    else{
        channel.send(`**-= Pas d'évênements enregistrés =-**`)

        return true
    }
}

async function update_calendar(guild, utils, calendar_id){
    var events= (await _request_calendarEventsInfos(calendar_id))
    if (!Boolean(events)){
        hereLog(`[update_calendar]{${calendar_id}} bad fetch of events for calendar '${calendar_id}'`)
        return false
    }

    var b= true
    var calendars_obj= utils.settings.get(guild, 'calendars')
    var channel_object= undefined
    if(Boolean(calendars_obj) && Boolean(channel_object=(calendars_obj[calendar_id]))){
        var update_check= utils.settings.get(guild,'update_check')
        update_check= (!Boolean(update_check))?{}:update_check
        for (var ch_id in channel_object){
            var channel= undefined
            if (Boolean(ch_id) && Boolean(channel=guild.channels.cache.get(ch_id))){
                var l_msg_id= (Boolean(channel_object[ch_id]))? channel_object[ch_id] : []
                var _t= (await _update_calendar_channel(calendar_id, channel, l_msg_id, events))
                if(_t) update_check[calendar_id]['lastTime']= Date.now()
                update_check[calendar_id]['unnecessary']= _t
                b= b && _t
            }
            else{
                hereLog(`[update] error while updating calendar '${calendar_id}': bad channel id given ${ch_id}`)
            }
        }
        utils.settings.set(guild,'update_check',update_check)
    }

    return b
}


function __list_tags_and_categories(utils, guild){
    var str= `__category list__:\n`
    var cal_cat_list= utils.settings.get(guild, 'categories')
    if ((!Boolean(cal_cat_list)) || (cal_cat_list.length<=0)){
        str+= `\t⋅ no categories data`
    }
    else{
        var i= 0
        for (var c in cal_cat_list){
            str+= `\t⋅ #${c}${(i<=0)?' (default)':''}\n`
            ++i
        }
    }

    var cal_tags_dict= utils.settings.get(guild, 'tags')
    str+= `__tag list__:\n`
    if ((!Boolean(cal_tags_dict)) || (Object.keys(cal_tags_dict)).length<=0){
        str+= `\t⋅ no tags data`
    }
    else{
        for (var t in Object.keys(cal_tags_dict)){
            str+= `\t⋅ ${cal_tags_dict[t]} - #${t}\n`
        }
    }

    return str
}


async function cmd_main(cmdObj, clearanceLvl, utils){
    let message= cmdObj.msg_obj;
    let args= cmdObj.args;

    if(args[0]==="set" && (clearanceLvl>CLEARANCE_LEVEL.NONE)){
        if(args.length<3){
            message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - needs 2 arguments: \`!calendar add calendar_id@gmail.com #channelMention\``)
            return false
        }

        let cal_id= args[1]
        let cal_id_regex= G_MAIL_REGEX
        if (!Boolean(cal_id.match(cal_id_regex))){
            message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - first argument needs to be a goolge calendar id: \`something@gmail.com\``)
            return false
        }

        var channel= undefined
        if(!(Boolean(message.mentions) && Boolean(message.mentions.channels) && Boolean(channel=message.mentions.channels.first()))){
            message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - needs a channel mention as target for calendar retranscript`)
            return false
        }

        var calendars= utils.settings.get(message.guild, 'calendars');
        var ch_obj= {}
        ch_obj[channel.id]= {}
        if(!Boolean(calendars)){
            calendars= {}
            calendars[cal_id]= ch_obj
        }
        else if(!Boolean(calendars[cal_id])){
            calendars[cal_id]= ch_obj
        }
        else if (!calendars[cal_id][channel.id]){
            calendars[cal_id][channel.id]= {}
        }
        utils.settings.set(message.guild, 'calendars', calendars);

        return true
    }
    else if (args[0]==="get" && (clearanceLvl>CLEARANCE_LEVEL.NONE)){
        var resp=`[${message.guild.name}] **List of (g)calendars**:\n`
        
        var calendars= utils.settings.get(message.guild, 'calendars')
        for (var k in calendars){
            resp+= `\t\`${k}\`:\n`
            if (Boolean(calendars[k])){
                for (var ch_id in Object.keys(calendars[k])){
                    var channel= undefined
                    if (Boolean(channel=(message.guild.channels.cache.get(ch_id)))){
                        resp+= `\t\t- *${channel.name}}*`
                    }
                    else{
                        resp+= `\t\t- *⚠ Unknown channel*`
                    }
                }
            }
            else{
                resp+= `\t\t- *⚠ No channels*`
            }
        }

        message.author.send(resp, {split: true})
        return true;
    }
    else if (args[0]==="clean" && (clearanceLvl>CLEARANCE_LEVEL.NONE)){
        var resp=`[${message.guild.name}] **(g)calendars clean**:\n`

        var calendars= utils.settings.get(message.guild, 'calendars')
        var cal_del=[]
        for (var k in calendars){
            var channels= calendars[k]

            var remaining_ch= 0
            for (var ch_id in Object.keys(channels)){
                if (!Boolean(message.guild.channels.cache.get(ch_id))){
                    delete calendars[k][ch_id]
                }
                else ++remaining_ch;
            }

            if(remaining_ch>0){
                var n_cleans= Math.max(0,(tmp-(channels.length)))
                if (n_cleans>0){
                    resp+= `\t\`${k}\`:\n`
                    resp+= `\t\t- ${n_cleans} channels unlinked`
                    calendars[k]= channels
                }
            }
            else{
                cal_del.push(k)
                resp+= `\tremoving calendar \`${k}\``
            }
        }

        for (var k in cal_del){
            delete calendars[k]
        }
        utils.settings.set(message.guild, 'calendars', calendars);

        message.author.send(resp, {split: true})
        return true
    }
    else if (args[0]==="test"){
        if(args.length<2 || !Boolean(args[1].match(G_MAIL_REGEX))){
            message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - first argument needs to be a goolge calendar id: \`something@gmail.com\``)
            return false
        }

        var cal_id= args[1]
        var cal_infos= undefined
        try{
            if(Boolean(cal_infos=(await _request_calendarEventsInfos(cal_id)))){
                var resp= `Able to authenticate and fecth infos from "${cal_id}"`
                var l= 0
                if(Boolean(cal_infos.data) && Boolean(cal_infos.data.items)){
                    if(Boolean(cal_infos.data.items) && (l=cal_infos.data.items.length>0)){
                        resp+= `\n- found ${l} event${(l>1)?'s':''}`
                    }
                    else{
                        resp+= `\n- no event found`
                    }
                }
                else{
                    resp+= `\n- ⚠ can't access to events data though...`
                }

                message.channel.send(resp)
                return true
            }
            else{
                message.author.send(`Unable to access data from "${cal_id}"`)
                return false
            }
        }
        catch(err){
            hereLog(`[test]{${cal_id}} request events infos failed - ${err}`)
            message.author.send(`Unable to access data from "${cal_id}" for some reason (internal error)`)
            return false
        }
    }
    else if (Boolean([/^r(e)?m(ove)?$/,/^del(ete)?$/].find(e => {return Boolean(args[0].match(e))})) && (clearanceLvl>CLEARANCE_LEVEL.NONE)){
        if(args.length<2 || !Boolean(args[1].match(G_MAIL_REGEX))){
            message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - first argument needs to be a goolge calendar id: \`something@gmail.com\``+
                                ` and second arguments can be a #channelMention`
            )
            return false
        }

        var cal_id= args[1]
        var calendars= utils.settings.get(message.guild, 'calendars')
        var ch_obj= calendars[cal_id]
        if (!(Boolean(calendars) && Boolean(ch_obj))){
            message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - nothing to remove`)
            return false
        }

        var channel= undefined

        let cal_ch_rm= (ch_id) => {
            channel= undefined
            if(Boolean(channel=(message.guild.channels.cache.get(ch_id)))){
                var messages= ch_obj[ch_id]
                if (Boolean(messages)){
                    for (var msg_id in messages){
                        var msg= undefined
                        try{
                            if(Boolean(msg=(await channel.messages.fetch(msg_id)))){
                                msg.delete().then( m => {}).catch(err => {
                                    hereLog(`[remove] error while removing message ${ch_id}/${msg_id} (channel ${channel.name}) - ${err}`)
                                })
                            }
                        }
                        catch(err){
                            hereLog(`[remove] error while fetching msg ${ch_id}/${msg_id} (channel ${channel.name}) - ${err}`)
                        }
                    }
                }
            }
            delete ch_obj[ch_id]
        }

        if (args.length>2 && (Boolean(message.mentions) && Boolean(message.mentions.channels) && Boolean(channel=message.mentions.channels.first()))){
            cal_ch_rm(channel.id)
        }
        else{
            for (var channel_id in Object.keys(ch_obj)){
                cal_ch_rm(channel_id)
            }
            delete calendars[cal_id]
        }

        var calendars= utils.settings.get(message.guild, 'calendars', calendars)

        return true
    }
    else if(['tag','tags'].includes(args[0])){
        var cal_tags= utils.settings.get(message.guild, 'tags')

        let _process_tag= (txt) =>{
            if (!Boolean(txt)) return undefined
            var _tag= (txt.startsWith('#'))?txt.slice(1):txt
            if (_tag.length<0){
                return undefined
            }
            return _tag
        }

        if(['rm','remove','del','delete'].includes(args[1])){
            if (args.length<3){
                message.author.send(`[${message.guild.name}][calendar]{${args[0]} ${args[1]}} - need to specifiy a tag to remove`)
                return false
            }

            var tag= _process_tag(args[2])
            if(!Boolean(tag)){
                message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - invalid tag`)
                return false
            }

            if(Boolean(cal_tag[tag])){
                delete cal_tag[tag]
            }

            utils.settings.set(message.guild, 'tags', cal_tags)
        }
        else if(['ls','list'].includes(args[1])){
            var str= `[${message.guild.name}][calendar]{${args[0]}}\n${__list_tags_and_categories(utils,message.guild)}`
            
            message.author.send(str, {split: true})
        }
        else{
            if (args.length<3){
                message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - add a tag with an emote that'll be used as a bullet. Ex:\n`+
                    `\t\`!calendar ${args[0]} tagname ▶\``
                )
                return false
            }
            
            var tag= _process_tag(args[1])
            if(!Boolean(tag)){
                message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - invalid tag`)
                return false
            }
            tag= tag.toLowerCase()

            var emote= identifyEmoji(args[2], utils)
            if(!Boolean(emote)){
                message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - second argument doesn't seem to be an emote`)
                return false
            }
            if(!Boolean(emote.emoji)){
                message.author.send(`[${message.guild.name}] [calendar]{${args[0]}} - needs to be an emote availabe on the server…`)
                return false;
            }

            cal_tags[tag]= emote.text

            utils.settings.set(message.guild, 'tags', cal_tags)
        }
        
        return true
    }
    else if(['category','categories','cat',"type"].includes(args[0])){
        var cal_category= utils.settings.get(message.guild, 'categories')

        let _process_cat= (txt) =>{
            if (!Boolean(txt)) return undefined
            var _cat= (txt.startsWith('#'))?txt.slice(1):txt
            if (_cat.length<0){
                return undefined
            }
            return _cat
        }


        if(['rm','remove','del','delete'].includes(args[1])){
            if (args.length<3){
                message.author.send(`[${message.guild.name}][calendar]{${args[0]} ${args[1]}} - need to specifiy a category to remove`)
                return false
            }

            var cat= _process_cat(args[2])
            if(!Boolean(cat)){
                message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - invalid category`)
                return false
            }

            var i= -1
            if((i=cal_category.indexOf(cat))>=0){
                cal_category.splice(i,1)
            }

            utils.settings.set(message.guild, 'categories', cal_category)
        }
        else if(['default','defaut','défaut'].includes(args[1])){
            if (args.length<3){
                message.author.send(`[${message.guild.name}][calendar]{${args[0]} ${args[1]}} - need to specifiy a category to set as default`)
                return false
            }

            var cat= _process_cat(args[2])
            if(!Boolean(cat)){
                message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - invalid category`)
                return false
            }
            cat= cat.toLowerCase()

            var i= -1
            if((i=cal_category.indexOf(cat))>=0){
                cal_category.splice(i,1)
            }
            cal_category= [ cat ].concat(cal_category)

            utils.settings.set(message.guild, 'categories', cal_category)
        }
        else if(['ls','list'].includes(args[1])){
            var str= `[${message.guild.name}][calendar]{${args[0]}}\n${__list_tags_and_categories(utils,message.guild)}`
            
            message.author.send(str, {split: true})
        }
        else{
            if (args.length<2){
                message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - specify a category to add. Ex:\n`+
                    `\t\`!calendar ${args[0]} categoryname \``
                )
                return false
            }
            
            var cat= _process_cat(args[1])
            if(!Boolean(tag)){
                message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - invalid category`)
                return false
            }
            cat= cat.toLowerCase()

            if(['default','defaut','défaut'].includes(args[2])){
                cal_category= [ cat ].concat(cal_category)
            }
            else{
                cal_category.push(cat)
            }

            utils.settings.set(message.guild, 'categories', cal_category)
        }

        return true
    }
    else if (args[0]==="update" && (clearanceLvl>CLEARANCE_LEVEL.NONE)){
        var calendars= utils.settings.get(message.guild, 'calendars')
        if(!Boolean(calendars)){
            message.author.send(`[${message.guild.name}][calendar]{${args[0]}} - nothing to update`)
            return false
        }

        var b= false
        for (var cal_id in Object.keys(calendars)){
            var chan_obj= undefined
            if (Boolean(cal_id) && Boolean(chan_obj=calendars[cal_id])){
                try{
                    b= b || (Boolean(await update_calendar(message.guild, cal_id, chan_obj)))
                }
                catch (err){
                    hereLog(`[update] error while updating calendar '${cal_id}' - ${err}`)
                }
            }
        }

        return b
    }
}


function cmd_help(cmdObj, clearanceLvl){}


function cmd_event(eventName, utils){
    if(eventName==="channelDelete"){
        var channel= arguments[2];

        var calendars_object= utils.settings.get(channel.guild, 'calendars')
        if(Boolean(calendars_object)){
            for (var cal_id in Object.keys(calendars_object)){
                var chan_obj= calendars_object[cal_id]
                if(Boolean(chan_obj[channel.id])){
                    delete chan_obj[channel.id]
                }
                if(Object.keys(chan_obj).length>0){
                    delete calendars_object[cal_id]
                }
            }

            utils.settings.set(channel.guild, 'calendars', calendars_object)

            return true
        }

        return false
    }
    else if("messageDelete"){
        var message= arguments[2];

        var calendars_object= utils.settings.get(channel.guild, 'calendars')
        if(Boolean(calendars_object)){
            for (var chan_obj in Object.values(calendars_object)){
                if(Boolean(chan_obj)){
                    for(var msg_list in Object.values(chan_obj)){
                        if(Boolean(msg_list) && msg_list.length>0){
                            for (var msg_id in msg_list){
                                if(message.id===msg_id){
                                    next_auto_update= true

                                    return true
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return false
}


function cmd_guild_clear(guild){}


function cmd_destroy(utils){
    hereLog("destroy…");
    if(Boolean(updateCal_job)){
        delete updateCal_job;
        updateCal_job= undefined;
    }
}

module.exports.name= ['calendar'];
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear, destroy: cmd_destroy};
