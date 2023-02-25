//jshint esversion:6
// constants
require('dotenv').config()
const mongoose = require('mongoose');
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const app = express();
const _ = require("lodash")
const encrypt = require("mongoose-encryption")

main().catch(err => console.log(err));

async function main() {
    // app setups
    app.set('view engine', 'ejs')
    app.use(bodyParser.urlencoded({extended: true}))
    app.use(express.static("public"))

    // mongo setup
    await mongoose.connect('mongodb://127.0.0.1/userDB');
    console.log("Connected");
    mongoose.set('strictQuery', false);

    // user schema setup
    const userSchema = new mongoose.Schema({
        email: String,
        password: String
    })
    
    userSchema.plugin(encrypt, {secret: process.env.SECRET, encryptedFields: ['password']})
    // setup mongoose model
    const User = new mongoose.model("user", userSchema)

    // get setups
    app.get("/", function(req, res) {
        res.render("home")
    })

    app.get("/login", function(req, res) {
        res.render("login")
    })

    app.get("/register", function(req, res) {
        res.render("register")
    })

    // post setups
    app.post("/register", function(req, res) {
        let newUser = new User({
            email: req.body.username,
            password: req.body.password
        })
        newUser.save(function(err){if (err) console.log(err); else res.render("secrets")})
    })

    app.post("/login", function(req, res) {
        const userName = req.body.username
        const password = req.body.password
        User.findOne({email: userName}, function(err, foundUser) {
            if (err) {
                console.log(err)
            } else {
                if (foundUser) {
                    if (foundUser.password === password) {
                        res.render("secrets")
                    }
                }
            }
        })
    })




  
    // server listen
    app.listen(3000, function() {
      console.log("Server started on port 3000");
    });
}