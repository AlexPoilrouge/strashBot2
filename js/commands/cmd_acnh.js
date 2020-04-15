
//CLEARANCE LEVEL:
// A particular member can have 3 different clearance level:
//  - CLEARANCE_LEVEL.NONE = 0 = 0b000 - no clearance level
//  - CLEARANCE_LEVEL.ADMIN_ROLE = 0b010 = 2  - member is recognized admin
//  - CLEARANCE_LEVEL.MASTER_ID = 0b100 = 4  - member is the bot's master
// A fourth level exists, used to contextualized a message:
//  - CLEARANCE_LEVEL.CONTROL_CHANNEL = 1 = 0b001 - posted in context of a 'control channel'
// Ofc, these level are stackable:
//  A clearance level of 7:
//    7 = 1+2+4 = 0b111 = CONTROL_CHANNEL+ADMIN_ROLE+MASTER_ID
//      is obtained when the master, who here is also an admin, posted a message in a
//      control channel
const CLEARANCE_LEVEL= require('../defines').CLEARANCE_LEVEL;

const cron= require('node-cron');

const fs = require('fs');

const sharp = require("sharp")

const generateData= require("./turnips/charter").generateData;


let hereLog= (...args) => {console.log("[cmd_acnh]", ...args);};



var l_guilds= [];

//when the module is loaded, during the bot's launch,
//this function is called.
//  utils is an object provided by the bot, constructed as follow:
//    utils= {
//     settings: {
//        set: function (guild, field, value) ,
//        get: function (guild, field),
//        remove: function (guild, field)
//     },
//     getMemberClearanceLevel: function(member),
//     bot_client,
//     cache_message_management:{
//        keepTrackOf: function (msg),
//        untrack: function (msg),
//        isTracked: function (msg),
//     }
//    }
//  Where:
//    'utils.settings.get(guild, field)' is a function you need to call when
//      you whant to access an saved object (json formatable) in this module's
//      persitent data.
//      Example: onlineRole= utils.settings.get(guild, 'online-role');
//    'utils.settings.set(guild, field, value)' is a function you need to call when
//      you want to save data (json formatable object) in this module's persistent
//      data.
//      Example: utils.settings.set(guild, 'number-of-cats', 5);
//    'utils.remove(guild, field)' is a function you need to call when you want to remove
//       a previously saved object of this module's persitent data.
//       Example: utils.remove(guild, 'online-role');
//    'utils.getMemberClearanceLevel(member)' is a function you need to call in order to know
//       the 'clearance level' of a particular guild member. (see below for clearance level)
//    'utils.bot_client' is this discord bot client.
//    'utils.cache_message_management.keepTrackOf(msg)' is a function to want to call when you
//      want to make sure a message is kept in the cache indefinetely. This is usefull, for
//      example, when you are tracking reaction on a given message indefinetly, keep it from
//      eventually being thrown out of the cache, and not recieving any notifications about this
//      message anymore.
//    'utils.cache_message_management.untrack(msg)' is a function to call when you no longer need
//      for a particular message to being kept in cache.
function cmd_init(utils){
    hereLog(`cmd init`);

    cron.schedule('0 2 * * 0', () => {
        hereLog("sunday at 02:00 ? flush members turnip data");

        l_guilds.forEach(g => {
            var members= utils.settings.get(g, 'members');
            members.forEach(m_id => {
                utils.settings.remove(g, m_id);
            });
            utils.settings.set(g, 'members', []);
        });
    });
}


function _acChannelRemoved(utils, channel_id, guild){
    var ac_chan= utils.settings.get(guild, "ac-channels");
    if(Boolean(ac_chan) && ac_chan.includes(channel_id)){
        utils.settings.set(guild, "ac-channels",
            ac_chan.filter(ch => {return ch!==channel_id})
        );
    }
}

//this function is called, during bot's launch (after 'cmd_init'),
//once per guild the bot is part of.
//It is the opprtunity, for example, to verify the data's integrity
//and coherence with the current state of the guild…
async function cmd_init_per_guild(utils, guild){
    l_guilds.push(guild);
    hereLog(`cmd init for guild ${guild}`);

    var ac_chan= utils.settings.get(guild, "ac-channels");
    if(Boolean(ac_chan)){
        ac_chan.forEach(chan_id => {
            if(!Boolean(chan=guild.channels.get(chan_id))){
                _acChannelRemoved(utils, chan_id, guild);
            }
        });
    }

    var members= utils.settings.get(guild, 'members');
    if(Boolean(members)){
        var now= new Date();
        members= members.filter(m_id =>{
            var user_data= utils.settings.get(guild, m_id);
            if(Boolean(user_data) && Boolean(user_data.update)){
                var limit_date= new Date(now.getTime()-(now.getDay()*86400000));
                limit_date.setHours(2,0,0,0);

                if(user_data.update<limit_date.getTime()){
                    utils.settings.remove(guild, m_id);
                    return false;
                }
            }
            return true;
        });

        utils.settings.set(guild, 'members', members);
    }
}


function __isACChannel(utils, channel){
    var ac_chan=utils.settings.get(channel.guild, "ac-channels");
    return (Boolean(ac_chan) && ac_chan.includes(channel.id));
}

function __dayNum(str){
    hereLog(`dayNum(${str})`)
    let week= [
        /^((dim(anche)?)|(sun(day)?))$/g,
        /^((lun(di)?)|(mon(day)?))$/g,
        /^((mar(di)?)|(tue(sday)?))$/g,
        /^((mer(credi)?)|(wed(nesday)?))$/g,
        /^((jeu(di)?)|(thu(rsday)?))$/g,
        /^((ven(dredi)?)|(fri(day)?))$/g,
        /^((sam(edi)?)|(sat(urday)?))$/g
    ];

    return week.findIndex( day_exp => {
        return (Boolean(str.toLowerCase().match(day_exp)));
    });
}

function _addToMemberTurnipData(utils, member, dayNum, moment , bells){
    hereLog(`_addToMemberTurnipData(utils, member, ${dayNum}, ${moment}, ${bells})`);
    var members= utils.settings.get(member.guild, "members");
    if(!Boolean(members)) members= [];
    if(!members.includes(member.id)){
        members.push(member.id);
        utils.settings.set(member.guild, "members", members);
    }

    var user_data= utils.settings.get(member.guild, member.id);
    if(!Boolean(user_data)){
        user_data= {};
    }
    var data= user_data.data;
    if(!Boolean(data)){
        data= [0,0,0,0,0,0,0,0,0,0,0,0,0];
    }
    if(dayNum===0){
        data[0]= bells
    }
    else if(dayNum>0 && dayNum<7){
        data[
            (dayNum*2)+((moment==="PM")?1:0)-1
        ]= bells
    }
    user_data['data']= data;
    user_data['update']= Date.now();
    utils.settings.set(member.guild, member.id, user_data);
}

function _sendMemberTurnipReport(utils, member){
    var user_data= utils.settings.get(member.guild, member.id);
    var data= user_data.data;
    if(Boolean(user_data) && Boolean(data) && data.length>=13){
        var buy= (Boolean(data[0]))?data[0]:0;
        var fsell= (Boolean(data[1]))?data[1]:0;

        var str= `*${member.guild.name}*:\n`
        if(fsell===0 || buy==0){
            str+= "\n⚠ Impossible de déduire le type de court du navet: données manquantes (prix d'achat du dimanche";
            str+= " ou prix de vente du lundi matin)…\n\n"
        }
        else{
            var x= fsell/buy;
            str+= `Type de court du navet pour la semaine (X=${x}):`;
            if(x>=0.91) str+="\tprobablement court de **type 1 *ou* 4**";
            else if(x>=0.85) str+="\tprobablement court de **type 2 *ou* 3 *ou* 4**";
            else if(x>=0.80) str+="\tprobablement court de **type 3 *ou* 4**";
            else if(x>=0.60) str+="\tprobablement court de **type 1 *ou* 4**";
            else str+="probablement court de type 4";
        }
        str+="\n\nDonnées fournies:\n";
        var p_str= (b => {return ((b>0)?b:'-')});
        str+=`Dimanche prix d'achat: *${p_str(buy)}*\n`;
        str+="Sem.\tAM\tPM\n";
        str+=`Lun\t${p_str(data[1])}\t${p_str(data[2])}\n`;
        str+=`Mar\t${p_str(data[3])}\t${p_str(data[4])}\n`;
        str+=`Mer\t${p_str(data[5])}\t${p_str(data[6])}\n`;
        str+=`Jeu\t${p_str(data[7])}\t${p_str(data[8])}\n`;
        str+=`Ven\t${p_str(data[9])}\t${p_str(data[10])}\n`;
        str+=`Sam\t${p_str(data[11])}\t${p_str(data[12])}\n\n`;
        str+="Source:\n\t<https://www.reddit.com/r/AnimalCrossing/comments/fr2cuq/guide_how_to_beat_the_stock_turnip_market_playing/>\n";
        str+="\thttps://imgix.bustle.com/uploads/image/2020/4/3/964f318d-a49c-4729-855d-e355bb801576-screen-shot-2020-04-03-at-32600-pm.png";

        member.send(str);
    }
    else{
        member.send(`From *${member.guild.name}*, no turnip registered data found for your username…`);
    }
}

function __anlyseData(data){
    var fsell= data [1];
    var buy= data [0];
    var x= (Boolean(buy) && buy>0)? fsell/buy : 0;

    var typeCues=[x,
        (x>=0.91 || (x>=0.60 && x<=0.80))?2:(x<=0)?1:0,
        ((x>=0.85 && x<0.91) || x<=0)?1:0,
        (x>=0.85 && x<0.91)?1:(x>=0.80 && x<0.85)?2:(x<=0)?1:0,
        (x<0.60)?3:1,
    ];


    var t_data= data.slice(1);
    var c_complete= 0;
    t_data.forEach(elmt => {
        if(elmt>0 && elmt<=9999){
            ++c_complete;
        }
    });
    var completion= c_complete/12;

    var start=0, end=0, miss=0, prev=0, prev_i=-1;
    var peaks=[];
    for(var i=0; i<12; ++i){
        if(t_data[i]>0 && t_data[i]<=9999){
            if(start===0) start=i;
            end=i;
            
            if(prev>0 && prev<=9999){
                var dir= (t_data[i]>prev)?1:-1;
                var last_peak= (peaks.length>0)?peaks[peaks.length-1]:{};

                if(last_peak.dir===dir){
                    last_peak['end']= i;
                }
                else{
                    last_peak['dir']= dir;
                    last_peak['start']=(prev_i<0)?((start<i)?start:0):prev_i;
                    last_peak['end']=i;
                    last_peak['miss']=0;
                    peaks.push(last_peak);
                }
            }

            prev=t_data[i];
            prev_i= i;
        }
        else{
            ++miss;
            if(peaks.length>0){
                var last_peak= peaks[peaks.length-1];
                ++last_peak['miss'];
            }
        }
    }

    if(typeCues[2]>0){
        if(peaks.find(p => {return p['dir']>0;})) typeCues[2]= 0;
        else{
            if(peaks.length===1){
                var remaining= (12-end);
                if((remaining+peaks[0]['miss'])<4) typeCues[4]=0;
                else{
                    var l= end-start;
                    var err= miss/l;
                    typeCues[4]=(1-err)*typeCues[4];
                    typeCues[4]=(typeCues[4]<0)?0:typeCues[4];
                }

                if((remaining+peaks[0]['miss'])<3) typeCues[3]=3;
                else{
                    var l= end-start;
                    var err= miss/l;
                    typeCues[3]=(1-err)*typeCues[3];
                    typeCues[3]=(typeCues[3]<0)?0:typeCues[3];
                }
            }

            var length= end-start;
            typeCues[1]= typeCues[1]*(length/12);
        }
    }

    if(typeCues[3]>0){
        if(peaks.length>3) typeCues[3]=0;
        else if(peaks.length>1){
            var ll_peak= peaks[peaks.length-1];
            var len_ll_p= ll_peak['end']-ll_peak['start'];
            if( (ll_peak['dir']>0 && len_ll_p>1) || (ll_peak['dir']<0 && len_ll_p>1) ){
                if(ll_peak['miss']<=0){
                    typeCues[3]=0;
                }
                else{
                    var l= end-start;
                    var err= miss/l;
                    typeCues[3]=(1-err)*typeCues[3];
                    typeCues[3]=(typeCues[3]<0)?0:typeCues[3];
                }
            }
        }

        var f_u_p= undefined;
        if(Boolean(f_u_p=peaks.find(p => {p['dir']>0}))){
            var l_fup= f_u_p['end']-f_u_p['start'];
            if(l_fup>1){
                if(l_fup['miss']<=0) typeCues[4]=0;
                else{
                    var l= end-start;
                    var err= miss/l;
                    typeCues[4]=(1-err)*typeCues[4];
                    typeCues[4]=(typeCues[4]<0)?0:typeCues[4];
                }
            } 
        }
    }

    if(typeCues[4]>0){
        var f_u_p= undefined;
        if(Boolean(f_u_p=peaks.find(p => {p['dir']>0}))){
            var l_fup= f_u_p['end']-f_u_p['start'];
            if(l_fup>1){
                if(l_fup['miss']<=0) typeCues[4]=0;
                else{
                    var l= end-start;
                    var err= miss/l;
                    typeCues[4]=(1-err)*typeCues[4];
                    typeCues[4]=(typeCues[4]<0)?0:typeCues[4];
                }
            } 
        }

        var pos_peak= 0;
        peaks.forEach(p => {
            if(p['dir']>0){
                ++pos_peak;
            }
        });
        if(pos_peak>2) typeCues[4]= 0;

        if(peaks.length>0 && peaks.length<=5){
            var p= undefined;
            if((p=peaks[0])['dir']>0){
                if(p['miss']===0){
                    typeCues[4]=0;
                }
                else{
                    typeCues[4]= typeCues[4]*0.66;
                }
            }
            else{
                var len= p['end']-p['start'];
                if(len>1){
                    if(p['miss']===0) typeCues[1]= typeCues[1]*0.5;
                    else typeCues[1]= typeCues[1]*0.66;
                }
            }
            if(peaks.length>1 && (p=peaks[1])['dir']>0){
                typeCues[4]= typeCues[4]*1.5;
                typeCues[1]= typeCues[1]*0.5;
            }
            if(peaks.length>2 && (p=peaks[2])['dir']<0){
                var len= p['end']-p['start'];
                if(len===1){
                    typeCues[4]= typeCues[4]*1.5;
                    typeCues[1]= typeCues[1]*0.5;                    
                }
                else{
                    typeCues[1]= typeCues[1]*1.5;
                    typeCues[4]= typeCues[4]*0.5;
                }
            }
            if(peaks.length>3 && (p=peaks[3])['dir']>0){
                var len= p['end']-p['start'];
                var t= (len>2)?2:len;

                typeCues[4]= typeCues[4]*(1+(1/t));
                typeCues[1]= typeCues[1]*(1-(0.25*t));    
            }
        }
    }

    var f_cues= typeCues.slice(1);
    f_cues= f_cues.map((val, i) => {return {'type': (i+1), 'cue': val};} );
    f_cues= f_cues.sort( (a,b) => {return (b['cue']-a['cue']);}).filter(a => {return a['cue']>0;});

    return ((x===0)? "⚠ Facteur X inconnu! Impossible de déterminer le pattern…\n" : `Facteur X: ${x}\n`)+
        "Type de patterns reconnus:\n"+
        `${f_cues.map(a => `\tType ${a['type']}: match score ${a['cue']}`).join('\n')}`;
}

function __generateDataSVG(data){
    var svgStr= '<svg width="680" height="680" '+
        '\n\txmlns="http://www.w3.org/2000/svg"\n\txmlns:xlink="http://www.w3.org/1999/xlink">\n\n';

    svgStr+= '\t<rect width="680" height="680" style="fill:#ffffff"/>\n\n';

    svgStr+= '\t<line x1="10" y1="650" x2="660" y2="650" stroke="#000000" style="stroke-width:2"/>\n';
    svgStr+= '\t<line x1="10" y1="550" x2="660" y2="550" stroke="#888888"/>\n';
    svgStr+= '\t<line x1="10" y1="450" x2="660" y2="450" stroke="#888888"/>\n';
    svgStr+= '\t<line x1="10" y1="350" x2="660" y2="350" stroke="#888888"/>\n';
    svgStr+= '\t<line x1="10" y1="250" x2="660" y2="250" stroke="#888888"/>\n';
    svgStr+= '\t<line x1="10" y1="150" x2="660" y2="150" stroke="#888888"/>\n';
    svgStr+= '\t<line x1="10" y1="50" x2="660" y2="50" stroke="#888888"/>\n';
    svgStr+= '\t<line x1="10" y1="650" x2="10" y2="0" stroke="#000000" style="stroke-width:2"/>\n\n';

    svgStr+= '\t<text x="55" y="665">Lun</text>\n';
    svgStr+= '\t<text x="155" y="665">Mar</text>\n';
    svgStr+= '\t<text x="255" y="665">Mer</text>\n';
    svgStr+= '\t<text x="355" y="665">Jeu</text>\n';
    svgStr+= '\t<text x="455" y="665">Ven</text>\n';
    svgStr+= '\t<text x="555" y="665">Sam</text>\n\n';
    
    for(var i=1; i<data.length; ++i){
        if(data[i]>0 && data[i]<9999){
            svgStr+= `\t<circle cx="${10+i*50}" cy="${650-data[i]}" r="10" style="fill:#00cc00"/>\n`;
        }
    }

    svgStr+="\n";
    
    var l_data= data.slice(1).map((v,i,t)=>{
        if(v>0 && v<=9999){
            return {'x':(10+(i+1)*50),'y':(650-v),'hasDirectNext':((i<(t.length-1)) && t[i+1]>0 && t[i+1]<=9999)};
        }
        else{
            return undefined;
        }
    }).filter(v => {return Boolean(v)});
    hereLog("l_data filtered? "+l_data);
    for(var i=0; i<l_data.length; ++i){
        if(i<(l_data.length-1)){
            var v= l_data[i];
            var v_n= l_data[i+1];
            var b= true;
            svgStr+= `\t<line x1="${v['x']}" y1="${v['y']}" x2="${v_n['x']}" y2="${v_n['y']}" `+
                        `stroke="#00cc00" `+((b=v['hasDirectNext'])?'':'stroke-dasharray="5,5"')+' style="stroke-width:4"/>\n';
            
            if(!b){
                var steps= (v_n['x']-v['x'])/50;
                var v
                for(var ix= v['x']+50; ix<v_n['x']; ix+=50){
                    svgStr+= `\t<text x="${ix}" y="${v['y']+((v_n['y']-v['y'])/(v_n['x']-v['x']))*(ix-v['x'])}" font-size="20px" fill="#008800">?</text>\n`;
                }
            }
        }
    }

    svgStr+="\n\n</svg>";

    return svgStr;

}

function __generateDataPNG(data, fromMsg){
    let name= `turnip_${fromMsg.author.id}_${Date.now()}.svg`
    let svgPath= `data/${name}.svg`;
    let pngPath= `data/${name}.png`;

    var clean= () =>{
        if(fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
        if(fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
    };

    var _countNonZeros= 0;
    data.forEach(v =>{
        if(v>0 && v<=9999){
            ++_countNonZeros;
        }
    })
    if(_countNonZeros<=0 || (_countNonZeros===1 && data[0]>0 && data[0]<9999)){
        fromMsg.channel.send(fromMsg.author + " Pas assez de données vis a vis de ton cours du navet…");
        return;
    }

    fs.writeFile(svgPath, __generateDataSVG(data),err => { 
        if(err){
            hereLog("[svg] "+err);
            clean();
        }
        else{
            sharp(svgPath).png().toFile(pngPath)
                .then(info => {
                    hereLog(info);
                    fromMsg.channel.send(
                        `***Le cours du navet de ${fromMsg.author}:***\n\n` + __anlyseData(data),
                        {
                            files: [{
                                attachment: pngPath,
                                name: `${name}.png`
                        }]
                    }).finally(v => {
                        clean();
                    });
                }).catch(info => {
                    hereLog("[png] "+info);
                    clean();
                });
        }
    });
}

//this function is called when a command registered by this module
//(see end of this file) has been called in a guild.
// 'clearanceLvl' is the clearance level in wich this command has been posted
// 'cmdObj' is an object provided by the bot, constructed as follow:
//   cmdObj={
//      'command',
//      'args',
//      'msg_obj'
//   }
//  Where:
//   'cmdObj.command' is the string that constitutes the command called.
//   'cmdObj.args' is an array containing each remaining words of the command
//   'cmdObj.msg_obj' is the discord message object associated with the command
//     (see https://discord.js.org/#/docs/main/stable/class/Message)
async function cmd_main(cmdObj, clearanceLvl, utils){
    let args= cmdObj.args;
    let message= cmdObj.msg_obj;
    var d= undefined;

    if(cmdObj.command==="ac"){
        if(clearanceLvl>CLEARANCE_LEVEL.NONE){
            if(args[0]==="add-channel"){
                if(Boolean(message.mentions) && Boolean(message.mentions.channels) && message.mentions.channels.size>0){
                    var ac_chan_id= utils.settings.get(message.guild, "ac-channels");
                    ac_chan_ids= (Boolean(ac_chan_id))? ac_chan_ids : [];

                    message.mentions.channels.forEach(ch_m => {
                        if(!ac_chan_ids.includes(ch_m.id)){
                            ac_chan_ids.push(ch_m.id);
                        }
                    });

                    utils.settings.set(message.guild, "ac-channels", ac_chan_ids);

                    return true;
                }
                else{
                    message.author.send("No mention to any channel with the command `add-ac-channel`");
                    return false;
                }
            }
            else if(args[0]==="channels"){
                var ac_chan_ids= utils.settings.get(message.guild, "ac-channels");
                if(Boolean(ac_chan_ids) && ac_chan_ids.length>0){
                    var str=`In *${message.guild.name}*, Animal Crossing Channels are`;
                    ac_chan_ids.forEach(ch_id => {
                        var ac_chan= message.guild.channels.get(ch_id);
                        str+= (Boolean(ac_chan))? `, *#${ac_chan.name}*`: ", Unrecognized-channel";
                    });

                    message.author.send(str);
                    return true;
                }
                else{
                    message.author.send(`No channel set for Animal Crossing on *${message.guild.name}*…`);
                    return true;
                }
            }
            else if(args[0]==="clear-channels"){
                utils.settings.remove(message.guild, "ac-channels");
                return true;
            }
        }
        else{
            return false;
        }
    }
    else if(cmdObj.command==="my-turnips" ){
        if(__isACChannel(utils, message.channel)){
            if(args[0]==="now"){
                var bells= undefined;
                if(Boolean(bells=parseInt(args[1])) && bells>0 && bells<=9999){
                    var now= new Date();
                    var m= (now.getHours()>=12)?"PM":"AM";
                    _addToMemberTurnipData(utils, message.member, now.getDay(), m, bells);
                    _sendMemberTurnipReport(utils, message.member);
                    return true;
                }
                else{
                    message.author.send("Command `my-turnips now [turnip-current-price]`, invalid bell amount…");
                    return false;
                }
            }
            else if(args[0]==="today"){
                var b1= undefined, b2= undefined;
                if(args.length>2 && Boolean(b1=parseInt(args[1]) && Boolean(b2=parseInt(args[2])))
                    && b1>0 && b1<9999 && b2>0 && b2<9999)
                {
                    var now= new Date();
                    _addToMemberTurnipData(utils, message.member, now.getDay(), 'AM' , b1);
                    _addToMemberTurnipData(utils, message.member,  now.getDay(), 'PM', b2);
                    _sendMemberTurnipReport(utils, message.member);
                    return true;
                }
                else{
                    message.author.send("Command `my-turnips today [turnip AM price] [turnip PM price]`, invalid bell amount…");
                    return false;
                }
            }
            else if(args[0]==="show"){
                var user_data= utils.settings.get(message.guild, message.member.id);
                var data=undefined, s_t= undefined;
                if( !Boolean(st=user_data["show_time"]) || ((Date.now()-st)>3600000) ||
                        (utils.getMemberClearanceLevel(message.member)>CLEARANCE_LEVEL.NONE) )
                {
                    if(Boolean(user_data) && Boolean(data=user_data.data) && data.length>0){
                        user_data["show_time"]= Date.now();
                        __generateDataPNG(data, message);
                        utils.settings.set(message.guild, message.member.id, user_data);
                        return true;
                    }
                    else{
                        message.author.send(`From *${message.guild.name}*, no turnip registered data found for your username…`);
                        return false;
                    }
                }
                else{
                    message.author.send(`*${message.guild.name}*: la commande \`my-turnips show\` n'est utilisable qu'une fois par heure…`);
                    return false;
                }
            }
            else
            {
                let _am_pm_convert= ( str =>{
                    if(str.toLowerCase().match(/^(am)|(mat(in)?)$/g)){
                        return 'AM';
                    }
                    else if(str.toLowerCase().match(/^(pm)|((a(pr(e|è|é)s)?\-(m(idi)?)))$/g)){
                        return 'PM';
                    }
                    else return str;
                });

                let _bell_arg_process= (str =>{
                    var bells= parseInt(str)
                    return (Boolean(bells) && bells>0 && bells<=9999)? bells : undefined;
                });

                var my_args= Array.from(args.slice(0));
                var d= undefined;
                if(my_args.some(arg => {return (d=__dayNum(arg))>=0;})){
                    while(my_args.length>0){
                        var arg= my_args.shift();
                        var d= undefined;
                        if( ((d=__dayNum(arg))===0 && my_args.length>=1) || (d>0 && my_args.length>=2) ){
                            var bells= undefined;
                            if(['AM','PM'].includes(_am_pm_convert(my_args[0]))){
                                var m= undefined;
                                while(my_args.length>1 && ['AM','PM'].includes(m=_am_pm_convert(my_args.shift())) ){
                                    if(Boolean(bells=_bell_arg_process(my_args[0]))){
                                        my_args.shift();
                                        _addToMemberTurnipData(utils, message.member, d, m , bells);
                                    }
                                }
                            }
                            else {
                                var m= 'AM';
                                while(my_args.length>0 && Boolean(bells=_bell_arg_process(my_args[0])) && d<7){
                                    my_args.shift();
                                    _addToMemberTurnipData(utils, message.member, d, m , bells);
                                    d= (m==='PM')? d+1 : d;
                                    m= (m==='AM')? 'PM' : 'AM';
                                }
                            }
                        }
                    }
                    _sendMemberTurnipReport(utils, message.member);
                }
                else{
                    d= 0;
                    var m= 'PM';
                    do {
                        var bells= _bell_arg_process(my_args.shift());
                        if(Boolean(bells)){
                            _addToMemberTurnipData(utils, message.member, d, m , bells);
                            d= (m==='PM')? d+1 : d;
                            m= (m==='AM')? 'PM' : 'AM';
                        }
                    } while(my_args.length>0 && d<7);
                    _sendMemberTurnipReport(utils, message.member);
                }

                return true;
            }
        }
        else{
            message.author.send(`*${message.guild.name}*: \`my-turnips\` commands are only available in animal crossing channels…`);
            return false;
        }
    }

}



//this function is called when a 'help' command has been called in a
//guild, regarding one of the commands registered by this module.
function cmd_help(cmdObj, clearanceLvl){}



//this function is called when an event has been recieved by the bot's client.
//See https://discord.js.org/#/docs/main/stable/class/Client for the event list).
function cmd_event(eventName, utils){
    let _hereLog= ((txt='') => {hereLog(`[ev:${eventName}] ${txt}`);});

    if(eventName==="channelDelete"){
        var channel= arguments[2];
        _hereLog(`channel ${channel}`);

        if(__isACChannel(channel)){
            var chans= utils.settings.get(channel.guild,'ac-channels');
            utils.settings.set(channel.guild,'ac-channels', chans.filter( ch_id => {
                    return ch_id!==channel.id;
                })
            );
        }
    }
}



//this function is called when the bot leaves a guild
function cmd_guild_clear(guild){}



//the module then needs to register these function for export
//  set 'module.exports.name' to a the name of a command this module wants to register.
//  it can registers several commands by providing an array of strings.
module.exports.name= ["ac","my-turnips"];
//  all the functions previously presented needs to be register is a grouped object, as the following:
module.exports.command= {init: cmd_init, init_per_guild: cmd_init_per_guild, main: cmd_main, help: cmd_help, event: cmd_event, clear_guild: cmd_guild_clear};