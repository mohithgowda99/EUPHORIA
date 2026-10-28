/** Bounded UTF-8 SSE framing; EOF never fabricates a final event. */
export async function* parseSSE(source,{maxBytes=128*1024}={}){
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let line='',data=[],event='message',bytes=0,wasCR=false;
  function consumeLine(){
    const current=line;line='';
    if(current===''){
      const frame=data.length?{event,data:data.join('\n')}:null;
      data=[];event='message';bytes=0;return frame;
    }
    if(current.startsWith(':'))return null;
    const colon=current.indexOf(':'),field=colon<0?current:current.slice(0,colon);
    let value=colon<0?'':current.slice(colon+1);if(value.startsWith(' '))value=value.slice(1);
    if(field==='data')data.push(value);else if(field==='event')event=value;
    return null;
  }
  for await(const chunk of source){
    const text=decoder.decode(chunk,{stream:true});
    for(const char of text){
      bytes+=Buffer.byteLength(char);if(bytes>maxBytes)throw Error('SSE frame limit exceeded');
      if(char==='\r'){const frame=consumeLine();wasCR=true;if(frame)yield frame;}
      else if(char==='\n'){if(!wasCR){const frame=consumeLine();if(frame)yield frame;}wasCR=false;}
      else{wasCR=false;line+=char;}
    }
  }
  decoder.decode(); // Reject incomplete UTF-8, discard incomplete SSE frames.
}
