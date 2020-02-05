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

    let splitCmd= message.content.substr(1).split(" ");
    return {
        'command': splitCmd[0].toLowerCase(),
        'args': splitCmd.slice(1),
        'msg_obj': message,
    }
}

module.exports.JSONCheck= JSONCheck;
module.exports.commandDecompose= commandDecompose;