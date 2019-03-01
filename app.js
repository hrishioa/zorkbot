const frotz = require('frotz-interfacer');
const BootBot = require('bootbot');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const fs = require('fs');

require('dotenv').config();

const adapter = new FileSync('user_db.json');
const user_db = low(adapter);

user_db.defaults({users: {}, suggestions: []}).write();

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
        title: "More Help",
        type: "web_url",
        url: "http://lmgtfy.com/?s=b&q=zork+walkthrough"
      } 
    ]
  }
]

bot.hear('help', (payload, chat) => {
  chat.say(welcomeMessage[0], {typing:true}).then(
    () => help_text.reduce((acc, cur) => acc.then(() => chat.say(cur, {typing: typing})), Promise.resolve()))
})

bot.on('postback:HELP_PAYLOAD', (payload, chat) => {
  chat.say(welcomeMessage[0], {typing:true}).then(
    () => chat.say(help_text))
})

bot.on('postback:TYPING_DELAY_PAYLOAD', (payload, chat) => {
  typing = user_db.get('users').get(payload.sender.id).get('typing').value()
  typing = !typing
  user_db.get('users').get(payload.sender.id).set('typing',typing).write()
  chat.say("Typing delay has been turned "+(typing?"on":"off")+".")
})

function addUser(payload, chat) {
  return chat.getUserProfile().then((user_info) => {
    user_db.set('users.'+payload.sender.id, user_info).write() 
    console.log("User saved.") 
    return Promise.resolve()
  }).then(() => {
    user_db.get('users').get(payload.sender.id).set('typing', true).write()
    user_db.get('users').get(payload.sender.id).set('currentGame', 0).write()
    return Promise.resolve();
  })
}

welcomeMessage = [
"Welcome to Zork, an interactive text world based on the titular game from the 1980s.",
"Choose from three worlds to battle grues and trolls, escape from maddening rooms and find hidden treasure. An adventure awaits.",
"For help or to switch between worlds, type 'help'. To do anything, simply type what you'd like to do (keep it simple tho). Go explore. Be careful."
]

bot.setGetStartedButton((payload, chat) => {
  console.log("Someone swiped left!")
  chat.say(welcomeMessage[0], {typing:true}).then(
    () => chat.say(welcomeMessage[1], {typing: true})).then(
    () => chat.say(welcomeMessage[2], {typing: true})).then(
    () => addUser(payload, chat)).then(
    () => selectWorld(payload, chat))
  })

function selectWorld(payload, chat) {
  return chat.say({
    text: "Which world do you choose?",
    buttons: [
    { type: 'postback', title: 'ZORK 1', payload: 'ZORK_1' },
    { type: 'postback', title: 'ZORK 2', payload: 'ZORK_2' },
    { type: 'postback', title: 'ZORK 3', payload: 'ZORK_3' }
    ]
  })
}

function setupGame(payload, chat, game) {
  user_db.get('users').get(payload.sender.id).set('currentGame',game).write()
  typing = user_db.get('users').get(payload.sender.id).get('typing').value()

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
  talk('look around', payload, chat)
})

bot.on('postback:RESTART', (payload, chat) => {
  game = user_db.get('users').get(payload.sender.id).get('currentGame').value()
  fs.unlinkSync(zorkSaves[game]+payload.sender.id+'.dat')
  talk('look around', payload, chat, true)
})

function talk(input, payload, chat, remove_starting) {
  user = user_db.get('users').get(payload.sender.id)
  user.set('lastMove', input).write()
  typing = user_db.get('users').get(payload.sender.id).get('typing').value()
  game = user_db.get('users').get(payload.sender.id).get('currentGame').value()
  runGame(input,game,payload.sender.id).then((game_output) => {
    user.set('lastOutput', game_output).write()
    if(game==0 && remove_starting)
      game_output = game_output.slice(8, 15)
    if(game==1 && remove_starting)
      game_output = game_output.slice(9, 15)
    if(game==2 && remove_starting)
      game_output = game_output.slice(11, 20)
    return game_output.slice(0,-1).reduce((acc, cur) => {
      console.log("saying ",cur)
      return acc.then(() => chat.say(cur, {typing: typing}))
    }, Promise.resolve()).then(() => chat.say({
        text: game_output[game_output.length-1],
        quickReplies: ['Share', input, 'go east', 'go west', 'go north', 'go south', 'Help']
      })
    )
  })  
}

function runGame(input, game, user_id) {
  return new Promise((resolve, reject) => {
    let interfacer = new frotz({
      executable: './frotz/dfrotz',
      gameImage: zorkImages[game % zorkImages.length],
      saveFile: zorkSaves[game % zorkSaves.length]+user_id+".dat"
    });  
    interfacer.iteration(input, (error, output) => {
      if(error.error) {
        resolve(["The input couldn't be processed. Try again? If this doesn't work please log a suggestion."])
      } else {
        console.log("runGame returning ",output.pretty)
        resolve(output.pretty)
      }
    })    
  })
}

bot.on('postback:CHANGE_WORLD_PAYLOAD', (payload, chat) => {
  selectWorld(payload, chat)
})

bot.hear('test', (payload, chat) => {
  chat.sendTemplate({
        "template_type":"generic",
        "elements":[
        {
          "title":"Breaking News: Record Thunderstorms",
          "subtitle":"The local area is due for record thunderstorms over the weekend.",
          "image_url":"https://thechangreport.com/img/lightning.png",
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
                    "title": "I took the hat quiz",
                    "subtitle": "My result: Fez",
                    "image_url": "https://bot.peters-hats.com/img/hats/fez.jpg",
                    "default_action": {
                      "type": "web_url",
                      "url": "http://m.me/petershats?ref=invited_by_24601"
                    },
                    "buttons": [
                    {
                      "type": "web_url",
                      "url": "http://m.me/petershats?ref=invited_by_24601", 
                      "title": "Take Quiz"
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
})

bot.on('message', (payload, chat) => {
  console.log("Got message - ",payload.message.text);
  if(payload.message.text.toLowerCase() != "help" && payload.message.text.toLowerCase() != 'share')
    talk(payload.message.text, payload, chat)
});

bot.start();