const frotz = require('frotz-interfacer');
const BootBot = require('bootbot');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const fs = require('fs');
const Amplitude = require('amplitude');
const longjohn = require('longjohn');
require('console-stamp')(console, '[HH:MM:ss.l]');

require('dotenv').config();

const adapter = new FileSync('user_db.json');
const user_db = low(adapter);
user_db.defaults({users: {}, suggestions: []}).write();

const amplitude = new Amplitude(process.env.AMPLITUDE_API_KEY)
const bot = new BootBot({
  accessToken: process.env.ACCESS_TOKEN,
  verifyToken: process.env.VERIFY_TOKEN,
  appSecret: process.env.APP_SECRET
});

zorkImages = ['./game/zork1/DATA/ZORK1.DAT','./game/zork2/DATA/ZORK2.DAT','./game/zork3/DATA/ZORK3.DAT']
zorkSaves = ['./saves/zork1/','./saves/zork2/','./saves/zork3/']

bot.deletePersistentMenu()

help_text = [
  "If you're feeling stuck (which is really unusual), try 'look around', or 'hit (something) with (something)'.",
  "To change worlds or restart the game, select 'Change world/restart'.",
  {
    text: "If you really can't figure it out, you could hit more help, and it'll show you what I usually do. No shame. Does tend to ruin the game though.",
    buttons: [
      {
        title: 'Change world/Restart',
        type: 'postback',
        payload: 'CHANGE_WORLD_PAYLOAD'
      },
      {
        title: 'Typing delay toggle',
        type: 'postback',
        payload: 'TYPING_DELAY_PAYLOAD'
      },
      {
        title: "More Help",
        type: "web_url",
        url: "http://lmgtfy.com/?s=b&q=zork+walkthrough"
      } 
    ]
  }
]

function amplitudeEvent(user_id, event_type, event_properties={}) {
  return new Promise((resolve, reject) => {
    try {
      amplitude.track({ user_id, event_type, event_properties });
      resolve();
    } catch (err) {
      console.error("Error sending event to amplitude - ",err)
      resolve()
    };
  })
}

function amplitudeAddUser(user_id, user_properties) {
  return new Promise((resolve, reject) => {
    try {
      amplitude.identify({ user_id, user_properties });
      resolve();
    } catch (err) {
      console.error("Error adding user to amplitude - ",err)
      resolve() 
    };    
  })
}

bot.hear('help', (payload, chat) => {
  try {
    amplitudeEvent(payload.sender.id, 'help')
    typing = user_db.get('users').get(payload.sender.id).get('typing').value()
    chat.say(welcomeMessage[0], {typing:true}).then(
      () => help_text.reduce((acc, cur) => acc.then(() => chat.say(cur, {typing: typing})), Promise.resolve()))
  } catch(e) {
    console.error("Error in help - ",e)
  }
})

bot.on('postback:HELP_PAYLOAD', (payload, chat) => {
  try {
    amplitudeEvent(payload.sender.id, 'help')
    chat.say(welcomeMessage[0], {typing:true}).then(
      () => chat.say(help_text))
  } catch(e) {
    console.error("Error in help_payload - ",e)
  }
})

bot.on('postback:TYPING_DELAY_PAYLOAD', (payload, chat) => {
  try {
    typing = user_db.get('users').get(payload.sender.id).get('typing').value()
    typing = !typing
    user_db.get('users').get(payload.sender.id).set('typing',typing).write()
    chat.say("Typing delay has been turned "+(typing?"on":"off")+".")
    amplitudeEvent(payload.sender.id, 'typing', {value: typing})
  } catch(e) {
    console.error("Error in typing_delay_payload - ",e)
  }
})

function addUser(payload, chat) {
  try {
    return chat.getUserProfile().then((user_info) => {
      user_db.set('users.'+payload.sender.id, user_info).write() 
      console.log("User saved.") 
      amplitudeAddUser(payload.sender.id,user_info)
      return Promise.resolve()
    }).then(() => {
      user_db.get('users').get(payload.sender.id).set('typing', true).write()
      user_db.get('users').get(payload.sender.id).set('currentGame', 0).write()
      return Promise.resolve();
    })
  } catch(e) {
    console.error("Error in addUser - ",e)
  }
}

welcomeMessage = [
"Welcome to Zork, an interactive text world based on the titular game from the 1980s.",
"Choose from three worlds to battle grues and trolls, escape from maddening rooms and find hidden treasure. An adventure awaits.",
"For help or to switch between worlds, type 'help'. To do anything, simply type what you'd like to do (keep it simple tho). Go explore. Be careful."
]

bot.setGetStartedButton((payload, chat) => {
  try {
    console.log("Someone swiped left!")
    amplitudeEvent(payload.sender.id, 'Get Started')
    chat.say(welcomeMessage[0], {typing:true}).then(
      () => chat.say(welcomeMessage[1], {typing: true})).then(
      () => chat.say(welcomeMessage[2], {typing: true})).then(
      () => addUser(payload, chat)).then(
      () => selectWorld(payload, chat))
  } catch(e) {
    console.error("Error in getStartedButton - ",e)
  }
})

function selectWorld(payload, chat) {
  try {
    amplitudeEvent(payload.sender.id, 'Select World')
    return chat.say({
      text: "Which world do you choose?",
      buttons: [
      { type: 'postback', title: 'ZORK 1', payload: 'ZORK_1' },
      { type: 'postback', title: 'ZORK 2', payload: 'ZORK_2' },
      { type: 'postback', title: 'ZORK 3', payload: 'ZORK_3' }
      ]
    })
  } catch(e) {
    console.error("Error in selectWorld - ",e)
  }
}

function setupGame(payload, chat, game) {
  try {  
    user_db.get('users').get(payload.sender.id).set('currentGame',game).write()
    typing = user_db.get('users').get(payload.sender.id).get('typing').value()
    amplitudeEvent(payload.sender.id, 'World Selected', {game: game})
    if(fs.existsSync(zorkSaves[game]+payload.sender.id+'.dat')) {
      chat.say({
        text: "You have an existing save. Would you like to continue or restart and overwrite the save?",
        buttons: [
        { type: 'postback', title: 'Continue', payload: 'CONTINUE'},
        { type: 'postback', title: 'Restart', payload: 'RESTART'}
        ]
      })
    } else {
      talk('look around', payload, chat, true)
    }  
  } catch(e) {
    console.error("Error in setupGame - ",e)
  }
}

bot.on('postback:ZORK_1', (payload, chat) => {
  setupGame(payload, chat, 0)
})

bot.on('postback:ZORK_2', (payload, chat) => {
  setupGame(payload, chat, 1)
})

bot.on('postback:ZORK_3', (payload, chat) => {
  setupGame(payload, chat, 2)
})

bot.on('postback:CONTINUE', (payload, chat) => {
  amplitudeEvent(payload.sender.id, 'Continue Game')
  talk('look around', payload, chat)
})

bot.on('postback:RESTART', (payload, chat) => {
  try {
    game = user_db.get('users').get(payload.sender.id).get('currentGame').value()
    amplitudeEvent(payload.sender.id, 'Restart Game', {game: game})
    fs.unlinkSync(zorkSaves[game]+payload.sender.id+'.dat')
    talk('look around', payload, chat, true)
  } catch(e) {
    console.error("Error in restartPostback - ",e)
  }
})

function talk(input, payload, chat, remove_starting) {
  console.log("Talk starting...")
  try {
    user = user_db.get('users').get(payload.sender.id)
    user.set('lastMove', input).write()
    typing = user_db.get('users').get(payload.sender.id).get('typing').value()
    game = user_db.get('users').get(payload.sender.id).get('currentGame').value()
    runGame(input,game,payload.sender.id).then((game_output) => {
      console.log("Talk - runGame returned...")
      user.set('lastOutput', game_output).write()
      if(game==0 && remove_starting)
        game_output = game_output.slice(8, 15)
      if(game==1 && remove_starting)
        game_output = game_output.slice(9, 15)
      if(game==2 && remove_starting)
        game_output = game_output.slice(11, 20)
      return game_output.slice(0,-1).reduce((acc, cur) => {
        // console.log("saying ",cur)
        return acc.then(() => chat.say(cur, {typing: typing}))
      }, Promise.resolve()).then(() => chat.say(

      {
          text: game_output[game_output.length-1],
          quickReplies: ['Share', input, 'look around', 'Help']
        }
        )
      )
    })  
    amplitudeEvent(payload.sender.id, 'Talk', {input: input})
    console.log("Talk - Sent off amplitude event.")
  } catch(e) {
    console.error("Error in talk - ",e)
  }
}

function runGame(input, game, user_id, retries=0) {
  try {
    console.log("runGame started..")
    return new Promise((resolve, reject) => {
      let interfacer = new frotz({
        executable: './frotz/dfrotz',
        gameImage: zorkImages[game % zorkImages.length],
        saveFile: zorkSaves[game % zorkSaves.length]+user_id+".dat"
      });  
      console.log("runGame - interfacer created.")
      interfacer.iteration(input, (error, output) => {
        console.log("runGame - interfacer returned.")
        if(error.error) {
          resolve(["The input couldn't be processed. Try again? If this doesn't work please log a suggestion."])
        } else {
          console.log("runGame returning ",output.pretty)
          resolve(output.pretty)
        }
      })    
    })
  } catch(e) {
    console.error("Error encountered in runGame - ",e)
    if(retries == undefined || retries < 2) {
      return runGame(input, game, user_id, retries+1)
    } else {
      return Promise.reject("Couldn't talk to game engine.")
    }
  }
}

bot.on('postback:CHANGE_WORLD_PAYLOAD', (payload, chat) => {
  amplitudeEvent(payload.sender.id, 'Change World')
  selectWorld(payload, chat)
})

bot.hear('share', (payload, chat) => {
  try {
    amplitudeEvent(payload.sender.id, 'Share', {line: user.get('lastOutput').value().slice(-1)[0], game: user.get('currentGame').value()+1})
    user = user_db.get('users').get(payload.sender.id)
    chat.sendTemplate({
          "template_type":"generic",
          "elements":[
          {
            "title":"ZORK "+(user.get('currentGame').value()+1),
            "subtitle":user.get('lastOutput').value().slice(-1)[0],
            "image_url":"https://github.com/hrishioa/zorkbot/raw/master/images/tmp.jpg",
            "buttons": [
            {
              "type": "element_share",
              "share_contents": { 
                "attachment": {
                  "type": "template",
                  "payload": {
                    "template_type": "generic",
                    "elements": [
                    {
                      "title": "ZORK "+(user.get('currentGame').value()+1)+": My Story",
                      "subtitle": user.get('lastOutput').value().slice(-1)[0],
                      "image_url": "https://github.com/hrishioa/zorkbot/raw/master/images/tmp.jpg",
                      "default_action": {
                        "type": "web_url",
                        "url": "http://m.me/zork"
                      },
                      "buttons": [
                      {
                        "type": "web_url",
                        "url": "http://m.me/zork", 
                        "title": "Join the world"
                      }
                      ]
                    }
                    ]
                  }
                }
              }
            }
            ]
          }
          ]
    })
  } catch(e) {
    console.error("Error in share - ",e)
  }
})

bot.on('message', (payload, chat) => {
  try {
    console.log("Got message - ",payload.message.text);
    if(payload.message.text.toLowerCase() != "help" && payload.message.text.toLowerCase() != 'share')
      talk(payload.message.text, payload, chat)
  } catch(e) {
    console.error("Error in bot.on(message) - ",e)
  }
});

bot.start();