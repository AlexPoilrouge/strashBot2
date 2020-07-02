#!/bin/python3

import sys

import os.path
from os import path

import glob


#reference for .lmp file parsing is
#'Kart-Public/src/g_game.c' file
#'void G_DoPlayDemo(char *defdemoname)' function
def lmp_extract(filepath):
    res= dict()

    if not path.exists(filepath) :
        res["success"]= False
        res["status"]= "no such file found"
        return res

    res["success"]= True
    res["status"]= "ok"
    res["file"]=filepath
    res['kart_replay']= False
    res["game_version"]= "0.0"
    res["map"]= "-"
    res['play']= True
    res['nb_files']= 0
    res['files']= []
    res['tics']= 0
    res['time']="0'00'00"
    res['nb_players']=0
    res['name']="-"
    res['skin']="unknown"
    res['color']="unknown"
    res['start']=0
    res['kartspeed']=0
    res['kartweight']=0
    res['mapID']=0


    try:
        with open(filepath,'rb') as f :
            f.seek(1)
            bt= f.read(10)
            t= bt.decode('utf-8')
            res['kart_replay']= (t=="KartReplay")
            if not res['play']:
                res["success"]= False
                res["status"]= f"File does not seem to be a SRB2Kart compatible file…"

                return res

            f.seek(12)
            bt= f.read(1)
            ver= int.from_bytes(bt, byteorder='little')
            bt= f.read(1)
            subver= int.from_bytes(bt, byteorder='little')
            res["game_version"]= f"{ver}.{subver}"

            f.seek(16)
            bt= f.read(64)
            mapname= bt.decode('utf-8')
            cut= mapname.find('\x00')
            res["map"]= mapname[:cut].rstrip('\x00')

            f.seek(96)
            bt= f.read(4)
            t= bt.decode('utf-8')
            res['play']= (t=="PLAY")
            if not res['play']:
                res["success"]= False
                res["status"]= f"File does not seem to be a record attack file…"

                return res

            bt= f.read(2)
            res['mapID']= int.from_bytes(bt, byteorder='little')



            f.seek(120)
            bt= f.read(1)
            res['nb_files']= int.from_bytes(bt, byteorder='little')

            m=121
            f.seek(m)
            while m>=121 and m<(121+320*res['nb_files']) and len(res['files'])<res['nb_files']:
                c= 0
                bt= f.read(1)
                m+=1
                ch= bt.decode('utf-8')
                name= ""+ch
                while c<64 and ch!='\x00' :
                    c+=1
                    bt= f.read(1)
                    m+=1
                    ch= bt.decode('utf-8')
                    name+=ch
                res['files'].append(name.rstrip('\x00'))
                m+=16
                f.seek(m)
            res['files']= res['files'] if len(res['files'])>0 else ['-'] 

            bt= f.read(4)
            tics = res['tics']= int.from_bytes(bt, byteorder='little', signed=True)
            res['time']= f"{int(tics/(35*60)):02d}\'{int(tics/35)%60:02d}\'{int((tics%35)*(100/35.0)):02d}" if tics>=0 else "unfinished"

            m+=16
            f.seek(m)
            bt= f.read(2)
            m+=2
            nb_players= res['nb_players']= int.from_bytes(bt, byteorder='little')

            if nb_players!=1 :
                res["success"]= False
                res["status"]= f"Single player replays only (got {nb_players} players)…"

                return res

            for i in range(0,nb_players):
                m+= 2
                ch=''
                f.seek(m)
                while ch!='\x00':
                    bt=f.read(1)
                    ch= bt.decode('utf-8')
                    m+=1
            m+=2

            f.seek(m)
            bt= f.read(16)
            res["name"]= bt.decode('utf-8').rstrip('\x00')
            bt= f.read(16)
            res["skin"]= bt.decode('utf-8').rstrip('\x00')
            bt= f.read(16)
            res["color"]= bt.decode('utf-8').rstrip('\x00')

            bt= f.read(4)
            res["start"]= int.from_bytes(bt, byteorder='little')

            bt= f.read(1)
            res["kartspeed"]= int.from_bytes(bt, byteorder='little')
            bt= f.read(1)
            res["kartweight"]= int.from_bytes(bt, byteorder='little')
                
    except Exception as e:
        res["success"]= False
        res["status"]= "error while reading file - "+str(e)
        return res

    return res

def mapTxtIdFromInt(mapId):
    mapIdTxt= "MAP"
    if (mapId<100) :
        mapIdTxt+= f"{mapId:02d}"
    else :
        mapIdTxt+= f"{chr(ord('A')+int((mapId-100)/36))}"
        if ((mapId-100)%36 < 10) :
            mapIdTxt+=f"{chr(ord('0')+(mapId-100)%36)}"
        else :
            mapIdTxt+=f"{chr(ord('A')+(mapId-100)%36-10)}"
    return mapIdTxt


def print_record_data(rec):
    pr_rec=f"{'SUCCESS' if rec['success'] else 'FAIL'}::::"+ \
    f"{rec['status']}::::"+ \
    f"{rec['map'].replace(' - Record Attack','').replace(' ','_')}::::"+ \
    f"v{rec['game_version']}::::"+ \
    f"{rec['nb_files']}::::"+ \
    f"{str(rec['files']).replace('[','').replace(']','').replace(', ',';')}::::"+ \
    f"{rec['tics']}::::"+ \
    f"{rec['time']}::::"+ \
    f"{rec['name']}::::"+ \
    f"{rec['skin']}::::"+ \
    f"{rec['color']}::::"+ \
    f"{rec['kartspeed']}::::{rec['kartweight']}::::"
    f_name= path.basename(rec['file'])
    f_name= f_name[:-4] if f_name.endswith('.lmp') else f_name
    pr_rec+= f"{f_name}::::"
    pr_rec+= f"{mapTxtIdFromInt(rec['mapID'])}"

    print(pr_rec)



if __name__ == "__main__" :
    if len(sys.argv)<=1 :
        print("ERROR::::No record file given")
        exit(1)

    if path.isdir(sys.argv[1]):
        l_f= glob.glob(f"{sys.argv[1]}/*.lmp")
        if len(l_f)==0:
            print("EMPTY::::No record found")
            exit(3)

        rec_list= []
        for f in l_f:
            rec_data=lmp_extract(f)
            if rec_data["success"] :
                rec_list.append(rec_data)

        if len(rec_list)<=0 :
            print("ERROR::::No record data found")
            exit(4)

        rec_list.sort(key=(lambda rec: rec["tics"] if rec["tics"]>=0 else 4294967295) )
        
        for r in rec_list :
            print_record_data(r)

    else:
        resp= lmp_extract(sys.argv[1])
        if not resp["success"] :
            print(f"FAIL::::{resp['status']}")
            exit(2)

        print_record_data(resp)
        
    