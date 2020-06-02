
const path= require( 'path' );


JSONCheck ={
    VERSION: 0b1,
    BUILD: 0b10,

    TOKEN: 0b100,

    MASTERID: 0b1000,

    FULL_CHECK: 0b1111,

    availability: JSONobject => {
        let r= 0b0;

        let testEmptyFn= (str, CTRL) => { if(str.length>0) r= r | CTRL;}

        testEmptyFn(JSONobject.version, JSONCheck.VERSION);
        testEmptyFn(JSONobject.build, JSONCheck.BUILD);
        testEmptyFn(JSONobject.token, JSONCheck.TOKEN);

        let testMatchFn= (str, regex, CTRL) => {
            if((str.length>0) && (str.match(regex)!==null)) { r= r | CTRL;}
        }
        let idRegexMatch= /^[0-9]{18}$/;

        testMatchFn(JSONobject.masterID, idRegexMatch, JSONCheck.MASTERID);

        return r;
    },

    validity: JSONobject => {
        let r= JSONCheck.availability(JSONobject);

        return ( r === JSONCheck.FULL_CHECK );
    },

    report: JSONobject => {
        let r= JSONCheck.availability(JSONobject);

        if( r === JSONCheck.FULL_CHECK ){
            return "JSON Settings correctly available";
        }

        let str= "Error generated by: ";
        
        let reportConcat= (CTRL, fieldName) => {
            if ( !(r & CTRL) ){
                str+= "\n\tJSON settings - "+fieldName;
            }
        }

        reportConcat(JSONCheck.VERSION, "version");
        reportConcat(JSONCheck.BUILD, "build");
        reportConcat(JSONCheck.TOKEN, "token");
        reportConcat(JSONCheck.MASTERID, "masterID");

        return str;
    },
};

function commandDecompose(message){
    if(!message.content.startsWith('!')){
        return null;
    }

    let splitCmd= message.content.substr(1).split(/[ ]+/);
    return {
        'command': splitCmd[0].toLowerCase(),
        'args': splitCmd.slice(1),
        'msg_obj': message,
    }
}

function commandNameFromFilePath(fpath){
    var cmd_name= path.basename(fpath);
    cmd_name= (cmd_name.startsWith("cmd_"))? cmd_name.slice(4) : cmd_name;
    cmd_name= (cmd_name.endsWith(".js"))? cmd_name.slice(0,-3) : cmd_name;

    return cmd_name;
}


/**
 * from https://github.com/hydrabolt/discord.js/pull/641
 */
const MESSAGE_CHAR_LIMIT = 2000;
const splitString = (string, prepend = '', append = '') => {
    if (string.length <= MESSAGE_CHAR_LIMIT) {
        return [string];
    }

    const splitIndex = string.lastIndexOf('\n', MESSAGE_CHAR_LIMIT - prepend.length - append.length);
    const sliceEnd = splitIndex > 0 ? splitIndex : MESSAGE_CHAR_LIMIT - prepend.length - append.length;
    const rest = splitString(string.slice(sliceEnd), prepend, append);

    return [`${string.slice(0, sliceEnd)}${append}`, `${prepend}${rest[0]}`, ...rest.slice(1)];
};

module.exports.JSONCheck= JSONCheck;
module.exports.commandDecompose= commandDecompose;
module.exports.commandNameFromFilePath= commandNameFromFilePath;
module.exports.splitString= splitString;