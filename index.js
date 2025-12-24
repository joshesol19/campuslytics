// Name: Joshua Solano
// Date: Nov 24, 2025


//////////////////////////////////////////////
// npm install dotenv express-session express pg ejs node knex
require('dotenv').config();


const express = require("express"); 

//Needed for the session variable - Stored on the server to hold data
const session = require("express-session");

let path = require("path");

// Allows you to read the body of incoming HTTP requests and makes that data available on req.body
let bodyParser = require("body-parser");

const multer = require('multer');

let app = express();

// Use EJS for the web pages - requires a views folder and all files are .ejs
app.set("view engine", "ejs");

// Root directory for static images
const imageRoot = path.join(__dirname, "images");

// Sub-directory where uploaded profile pictures will be stored
const graphsDir = path.join(imageRoot, "graphs");

const storage = multer.diskStorage({
    // Save files into our uploads directory
    destination: (req, file, cb) => {
        cb(null, graphsDir);
    },
    // Reuse the original filename so users see familiar names
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

// Create the Multer instance that will handle single-file uploads
const upload = multer({ storage });

// Expose everything in /images (including uploads) as static assets
app.use("/images", express.static(imageRoot));

// process.env.PORT is when you deploy and 3000 is for test
const port = process.env.PORT || 3000;

// sets up session vairables
app.use(
    session(
        {
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
        }
    )
);

// sets up sql use
// sets up sql use
const knex = require('knex')({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
  }
});


// Tells Express how to read form data sent in the body of a request
app.use(express.urlencoded({extended: true}));

const { spawn } = require('child_process');

const PYTHON = process.env.PYTHON_BIN || "python3";
const scriptPath = path.join(__dirname, 'python', 'analysis.py');

//////////////////////////////////////////////

// root instantly directs to login page
app.get("/", (req, res) => {
    res.redirect('/login')
  });




// /////////////////////// - SIGN-IN - ///////////////////////////////
app.get('/register', (req, res)=>{
  res.render('register', {error_message: ''})
})

app.post('/register', async (req, res) => {
  const { firstName, lastName, username, email, password, confirmPassword } = req.body;

  // check to see if username is already taken
  knex('users')
    .where('username', username)
    .first()
    .then(async (alreadyCreatedUser) => {
      if (alreadyCreatedUser) {
        return res.render('register', {
          error_message: 'Username already in use'
        });
      } else {
        if (password !== confirmPassword) {
          return res.render("register", {
            error_message: "Passwords do not match."
          });
        } else {
          const today = new Date();
          const dateCreated = today.toISOString().split("T")[0];

          const newAccount = {
            firstName,
            lastName,
            dateCreated
          };

          try {
            await knex.transaction(async (trx) => {
              const [account] = await trx('accounts')
                .insert(newAccount)
                .returning(['accountID']);

              const newUser = {
                username,
                email,
                password,
                firstName,
                lastName,
                accountID: account.accountID
              };

              await trx('users').insert(newUser);
            });

            res.redirect('/');
          } catch (err) {
            console.error(err);
            res.status(500).send('Database error creating account');
          }
        }
      }
    });
});

app.get('/privacy', (req, res) => {
  res.render('privacy');
});


  //this is the log in get. if youre logged in you get redirected into the worksop page
  //else, you have to log in
  app.get('/login', (req,res)=>{
    // Check if user is logged in
    if (req.session.isLoggedIn) {
        res.render('index',
            {
                loggedIn : req.session.isLoggedIn,
                accountID : req.session.accountID,
                username : req.session.username,
                level : req.session.level,
                firstName : req.session.firstName,
                error_message : ''
            }

        )
      } else {
          res.render("login", { error_message: "" });
      }
})


app.post('/login', (req, res) => {
  // grabs users submitted log in info as name ans password and email
  let sName = req.body.username;
  let sPassword = req.body.password;
  let sEmail = req.body.email;

  // checks to see if there is any log in values that are the same in the database
  knex.select()
  .from('users')
  .where("username", sName)
  .andWhere("password", sPassword)
  .first()
  .then(users => {
    // Check if a user was found with matching username AND password
    if (users) {
      // if so, then set session vairables to be true and levels and username
      req.session.isLoggedIn = true;
      req.session.username = users.username;
      req.session.email = users.email;
      req.session.level = users.level;
      req.session.firstName = users.firstName;
      req.session.lastName = users.lastName;
      req.session.accountID = users.accountID;

      //  render welcome page if new user, selse index
      if (users.age === 'N' & req.session.level === 'M') {
        knex('users')
          .where({ username: sName })
          .update({ age: 'O' })
          .then(() => {
            res.render('welcome', {
              error: '',
              loggedIn: req.session.isLoggedIn
            });
          })
          .catch(err => {
            console.error(err);
            res.status(500).send('Database error');
          });
      } else {
        res.render('index',
          {
              loggedIn : req.session.isLoggedIn,
              accountID : req.session.accountID,
              username : req.session.username,
              level : req.session.level,
              firstName : req.session.firstName,
              error_message : ''
          }
      )
      }
      
    } else {
      // No matching user found, display log in error
      res.render("login", { error_message: "Invalid login" });
    }
  })
  // catch errors and rerender with errors
  .catch(err => {
    console.error("Login error:", err);
    res.render("login", { error_message: "Invalid login" });
  });
})

// Logout route
app.get("/logout", (req, res) => {
// Get rid of the session object
req.session.destroy((err) => {
    if (err) {
        console.log(err);
    }
    res.render('login', {error_message:''});
});
});

// just tells the console the server is running
app.listen(port, () => {
  console.log("The server is listening");
});



// /////////////////////// - DEPOSITS - ///////////////////////////////
// shows all deposits on page
app.get('/displayDeposits', (req, res, next) => {
    if (!req.session.isLoggedIn) {
      return res.redirect('/login');
    }
  
    const accountID = req.session.accountID;
  
    knex('accounts')
      .where('accountID', accountID)
      .first()
      .then((account) => {
        if (!account) {
          return res.render('displayDeposits', {
            deposits: [],
            error_message: 'Account not found.',
            isLoggedIn: req.session.isLoggedIn,
            level: req.session.level
          });
        }
  
        knex('deposits')
          .where('accountID', accountID)
          .orderBy('depositDate', 'asc')
          .then((deposits) => {
  
            // If no deposits, just render empty
            if (!deposits || deposits.length === 0) {
              return res.render('displayDeposits', {
                deposits: [],
                error_message: '',
                isLoggedIn: req.session.isLoggedIn,
                level: req.session.level
              });
            }
  
            knex('withdrawals')
              .where('accountID', accountID)  // important: only this account
              .groupBy('depositID')
              .select('depositID')
              .sum({ totalCost: 'cost' })
              .then((withdrawalSummary) => {
  
                // Build lookup: depositID -> total withdrawal cost
                const withdrawalMap = {};
                withdrawalSummary.forEach((w) => {
                  withdrawalMap[w.depositID] = Number(w.totalCost);
                });
  
                // Running balance calc
                const initialBalance = Number(account.initialBalance || 0);
                let runningBalance = initialBalance;
  
                deposits.forEach((d) => {
                  const depositAmount = Number(d.depositAmount || 0);
                  const totalWithdrawals = withdrawalMap[d.depositID] || 0;
  
                  d.startBalance = runningBalance;
                  d.endBalance = runningBalance + depositAmount - totalWithdrawals;
  
                  runningBalance = d.endBalance;
                });
  
                deposits.reverse();
                // Render ONCE, outside the forEach
                res.render('displayDeposits', {
                  deposits,
                  error_message: '',
                  isLoggedIn: req.session.isLoggedIn,
                  level: req.session.level
                });
              });
          });
      })
      .catch((err) => {
        console.error('displayDeposits error:', err);
        // Let Express handle it / error middleware
        next(err);
      });
  });

  app.get('/addDeposit', (req, res) => {
    if (!req.session.isLoggedIn){
        console.log('not logged in')
    } else {
        res.render('addDeposit', {
            error_message: null,
            loggedIn: true
          });
    }
  

  });

  app.post('/addDeposit', async (req, res) => {
    if (!req.session.isLoggedIn) return res.redirect('/login');
  
    const { depositDate, depositAmount, hoursWorked, notes } = req.body;
    const accountID = req.session.accountID
  
    const newDeposit = {
        depositDate,
        depositAmount,
        hoursWorked,
        notes,
        accountID
      };
  
    knex('deposits')
    .insert(newDeposit)
    .then((deposit) => {
        res.redirect('/displayDeposits');
    })
  });

  app.get('/editDeposit/:depositID', (req, res) => {
    knex('deposits')
    .where('depositID', req.params.depositID)
    .first()
    .then((selectedDeposit) => {
      if (!Number(selectedDeposit.accountID) === Number(req.session.accountID)){
        console.log(`User with account ID '${req.session.accountID}' tried to edit a deposit with an account ID of '${selectedDeposit.accountID}'`)
        res.render('index',
          {
            loggedIn : req.session.isLoggedIn,
            accountID : req.session.accountID,
            username : req.session.username,
            level : req.session.level,
            firstName : req.session.firstName,
            error_message : 'Unable to edit desired Deposit'
        }
        )
      } else {
        res.render('editDeposit',
          {deposit : selectedDeposit,
           'error_message' : ''
          }
        )
      }
    })
  });

  app.post('/editDeposit/:depositID', (req,res) =>{
    //grab the vairables the deposit would like to edit the data row to be
    const { depositDate, depositAmount, hoursWorked, notes } = req.body;
    // another paramter in case some how the form gets submitted without the fields filled
    if ( !depositDate || !depositAmount ) {
        return knex("deposits")
            .where({ depositID: req.params.depositID })
            .first()
            .then((deposits) => {

                if (!deposits) {
                    return res.status(404).render("index", {
                      loggedIn : req.session.isLoggedIn,
                      accountID : req.session.accountID,
                      username : req.session.username,
                      level : req.session.level,
                      firstName : req.session.firstName,
                      error_message : 'Error in editting'
                    });
                }
                res.status(400).render("index", {
                  loggedIn : req.session.isLoggedIn,
                  accountID : req.session.accountID,
                  username : req.session.username,
                  level : req.session.level,
                  firstName : req.session.firstName,
                  error_message : 'Error in editting'
                });
            })
            // catch errors and rerender with errors
            .catch((err) => {
                console.error("Error fetching user:", err.message);
                res.status(500).render("index", {
                  loggedIn : req.session.isLoggedIn,
                  accountID : req.session.accountID,
                  username : req.session.username,
                  level : req.session.level,
                  firstName : req.session.firstName,
                  error_message : 'Error in editting'
                });
            });
    }
    // store the new vairables
    const updatedDeposit = {
      depositDate,
      depositAmount,
      hoursWorked,
      notes
    }
    // add/insert the new vairables into the table in the database
    knex("deposits")
        .where({ depositID: req.params.depositID })
        .update(updatedDeposit)
        .then((rowsUpdated) => {
            if (rowsUpdated === 0) {
                return res.status(404).render("index", {
                  loggedIn : req.session.isLoggedIn,
                  accountID : req.session.accountID,
                  username : req.session.username,
                  level : req.session.level,
                  firstName : req.session.firstName,
                  error_message : 'Error in editting'
                });
            }
            console.log(`User with accountID ${req.session.accountID} editted a deposit`)
            knex('deposits')
            .where('accountID', req.session.accountID)
            .then((deposits) => {
              res.redirect('/displayDeposits')
            })
            
        })
        // catch errors and rerender with errors
        .catch((err) => {
            console.error("Error updating user:", err.message);
            knex("users")
                .where({ depositID: req.params.depositID })
                .first()
                .then((deposit) => {
                    if (!deposit) {
                        return res.status(404).render("index", {
                          loggedIn : req.session.isLoggedIn,
                          accountID : req.session.accountID,
                          username : req.session.username,
                          level : req.session.level,
                          firstName : req.session.firstName,
                          error_message : 'Error in editting'
                        });
                    }
                    res.status(500).render("index", {
                      loggedIn : req.session.isLoggedIn,
                      accountID : req.session.accountID,
                      username : req.session.username,
                      level : req.session.level,
                      firstName : req.session.firstName,
                      error_message : 'Error in editting'
                    });
                })
                // catch errors and rerender with errors
                .catch((fetchErr) => {
                    console.error("Error fetching deposit after update failure:", fetchErr.message);
                    res.status(500).render("index", {
                      loggedIn : req.session.isLoggedIn,
                      accountID : req.session.accountID,
                      username : req.session.username,
                      level : req.session.level,
                      firstName : req.session.firstName,
                      error_message : 'Error in editting'
                    });
                });
        });
})

app.post('/deleteDeposit/:depositID', (req, res) => {
  let depositID = req.params.depositID
  knex('deposits')
  .where('depositID', depositID)
  .first()
  .then((selectedDeposit) => {
    if (!selectedDeposit){
      res.render('index', {
        loggedIn : req.session.isLoggedIn,
        accountID : req.session.accountID,
        username : req.session.username,
        level : req.session.level,
        firstName : req.session.firstName,
        error_message : 'Error: attempted deleting a deposit that does not exist'
})
    } else {
    if ( !selectedDeposit.accountID === req.session.accountID & !req.session.level === 'M' & !req.session.isLoggedIn ) {
      res.render('index', {
                  loggedIn : req.session.isLoggedIn,
                  accountID : req.session.accountID,
                  username : req.session.username,
                  level : req.session.level,
                  firstName : req.session.firstName,
                  error_message : 'Error: attempted deleting without permissions'
      })
    } else {
      knex('deposits')
      .where('depositID', depositID)
      .delete()
      .then((deleted) => {
        knex('withdrawals')
        .where('depositID', depositID)
        .delete()
        .then((deletedWith)=>{
          res.redirect('/displayDeposits');
        })
      })
    }
  }
  })
})




// /////////////////////// - USERS - ///////////////////////////////
// shows all users on page
app.get('/displayUsers', (req, res)=>{
    if (req.session.isLoggedIn & req.session.level === 'M') {
    //order all users 
    knex('users')
        .where('accountID', req.session.accountID)
        .then((users)=> {
            // render the results into the index page
            res.render("displayUsers", {
                error_message: '',
                loggedIn: req.session.isLoggedIn,
                accountID : req.session.accountID,
                username: req.session.username,
                level: req.session.level,
                users
              });
        })
    } else {
        res.redirect('/')
    }
  })

app.get('/editUser/:username', (req,res) =>{
    // only managers should do this, if they are a manager then great, proceed to the editing 
    // portion, if not, they will be thrown into the index page with an error telling them this 
    // (this is in the else part)
  const username = req.params.username;

  if (!req.session.isLoggedIn) return res.redirect('/login');
  if (req.session.level !== 'M') return res.status(403).send('Forbidden');

    // check to see if the username of the person they are trying to delete
  // is within their account
  knex('users')
  .where('username', username)
  .first()
  .then((user)=>{
    if (user.accountID === req.session.accountID){
      res.render('editUser', 
        {
          user,
          error_message : ''
        }
      )
    } else {
      res.render('index',
        {
          loggedIn : req.session.isLoggedIn,
          accountID : req.session.accountID,
          username : req.session.username,
          level : req.session.level,
          firstName : req.session.firstName,
          error_message : 'Error: Cannot edit that user!'
        }
      )
    }
  })
})

app.post('/editUser/:username', (req,res)=>{
    //grab the vairables the user would like to edit the data row to be
    const { username, email, password, firstName, lastName } = req.body;
    // another paramter in case some how the form gets submitted without the fields filled
    if ( !username || !email || !password || !firstName || !lastName ) {
        return knex("users")
            .where('username', req.params.username)
            .first()
            .then((user) => {
                if (!users) {
                    return res.status(404).render("index", {
                      loggedIn : req.session.isLoggedIn,
                      accountID : req.session.accountID,
                      username : req.session.username,
                      level : req.session.level,
                      firstName : req.session.firstName,
                      error_message : 'Error'
                    });
                }
                res.status(400).render("editUser", {
                    user,
                    loggedIn: req.session.isLoggedIn,
                    level:req.session.level,
                    error_message: "All Fields are required."
                });
            })
            // catch errors and rerender with errors
            .catch((err) => {
                console.error("Error fetching user:", err.message);
                res.status(500).render("index", {
                  loggedIn : req.session.isLoggedIn,
                  accountID : req.session.accountID,
                  username : req.session.username,
                  level : req.session.level,
                  firstName : req.session.firstName,
                  error_message : 'Error'
                });
            });
    }
    // store the new vairables
    const updatedUser = {
        username, 
        email, 
        password, 
        firstName,
        lastName 
    }
    // add/insert the new vairables into the table in the database
    knex("users")
        .where({ username: req.params.username })
        .update(updatedUser)
        .then((rowsUpdated) => {
            if (rowsUpdated === 0) {
                return res.status(404).render("index", {
                  loggedIn : req.session.isLoggedIn,
                  accountID : req.session.accountID,
                  username : req.session.username,
                  level : req.session.level,
                  firstName : req.session.firstName,
                  error_message : 'Error'
                });
            }
            res.redirect('/displayUsers');
        })
        // catch errors and rerender with errors
        .catch((err) => {
            console.error("Error updating user:", err.message);
            knex("users")
                .where({ userID: req.params.id })
                .first()
                .then((user) => {
                    if (!user) {
                        return res.status(404).render("index", {
                          loggedIn : req.session.isLoggedIn,
                          accountID : req.session.accountID,
                          username : req.session.username,
                          level : req.session.level,
                          firstName : req.session.firstName,
                          error_message : 'Error'
                        });
                    }
                    res.status(500).render("editUsers", {
                        user,
                        loggedIn: req.session.isLoggedIn,
                        level:req.session.level,
                        error_message: "Unable to update user. Please try again."
                    });
                })
                // catch errors and rerender with errors
                .catch((fetchErr) => {
                    console.error("Error fetching user after update failure:", fetchErr.message);
                    res.status(500).render("index", {
                      loggedIn : req.session.isLoggedIn,
                      accountID : req.session.accountID,
                      username : req.session.username,
                      level : req.session.level,
                      firstName : req.session.firstName,
                      error_message : 'Error'
                    });
                });
        });
})

app.get('/addUser', (req, res)=> {
  if (!req.session.isLoggedIn) return res.redirect("/login");
  if (req.session.level !== "M") return res.status(403).send("Forbidden");

  res.render('addUser', 
    {
      error_message : ''
    }
  )
});

app.post('/addUser', (req, res) => {
  if (!req.session.isLoggedIn) return res.redirect("/login");
  if (req.session.level !== "M") return res.status(403).send("Forbidden");

  const { username, firstName, lastName, email, password, confirmPassword } = req.body;

  if (confirmPassword == password) {
    const newUser = {
      username,
      firstName,
      lastName,
      email,
      password,
      accountID : req.session.accountID,
      level: 'U',
      age: 'O'
    }

    knex('users')
    .insert(newUser)
    .then((newUser) => {
      res.redirect('/displayUsers')
    })
  } else {
    res.render('/addUser', {error_message : 'Password does not match'})
  }


})

app.post('/deleteUser/:username', (req, res) => {
  const username = req.params.username;

  if (!req.session.isLoggedIn) return res.redirect('/login');
  if (req.session.level !== 'M') return res.status(403).send('Forbidden');

    // check to see if the username of the person they are trying to delete
  // is within their account
  knex('users')
  .where('username', username)
  .first()
  .then((user)=>{
    if (user.accountID === req.session.accountID & user.level === 'U') {
      knex('users')
      .where('username', username)
      .del()
      .then(rowsDeleted => {
        if (rowsDeleted === 0) {
          return res.status(404).send('User not found');
        }
        res.redirect('/displayUsers');
      })
      .catch(err => {
        console.error(err);
        res.status(500).send('Error deleting user');
      });
    } else {
      res.render('index',
        {
          loggedIn : req.session.isLoggedIn,
          accountID : req.session.accountID,
          username : req.session.username,
          level : req.session.level,
          firstName : req.session.firstName,
          error_message : 'Error: Cannot delete that user!'
        }
      )
    }
  })
});


// /////////////////////// - WITHDRAWALS - ///////////////////////////////
// renders add withdrawal page
app.get('/addWithdrawal/:depositID', (req, res) => {
    // only managers should do this, if they are a manager then great, proceed to the insertion 
    // portion, if not, they will be thrown into the index page with an error telling them this 
    // (this is in the else part)
    if (req.session.level === 'M') {
        res.render('addWithdrawal', 
            {
                error_message:'', 
                loggedIn: req.session.isLoggedIn,
                level: req.session.level,
                depositID: req.params.depositID
            });
    } else {
        res.redirect('/displayWithdrawl')
    }
})

// the point of this post is to add a workshop. only admins can visit it 
app.post('/addWithdrawal/:depositID', (req, res)=>{
    const { date, category, subcategory, location, cost, notes, onlineFlag} = req.body;
    const accountID = req.session.accountID;
    let depositID = req.params.depositID;
    
// another paramter in case some how the form gets submitted without the fields filled
    if ( !date || !category || !subcategory || !cost || !location || !onlineFlag ) {
        // re-render page with an error
        console.log('in the error')
        return res.status(400).render("addWithdrawal", { depositID, loggedIn: req.session.isLoggedIn, error_message: "all required fields are required.", level:req.session.level });
    }

    // insert newly stored withdrawal into the workshop table and then redirect
    knex('withdrawals') 
    .max('withdrawalID as maxID') 
    .first()
    .then((maxID) => {
        // store new withdrawal
        const withdrawalID = Number(maxID.maxID)+1
        const newWithdrawal = {
          withdrawalID,
            depositID,
            category, 
            subcategory, 
            withdrawalDate : date,
            location, 
            cost, 
            notes,
            onlineFlag,
            accountID
        };
        knex('withdrawals')
        .insert(newWithdrawal)
        .then((withdrawal) => {
            
            const redirectUrl = `/displayWithdrawl/${depositID}`;
            res.redirect(redirectUrl);
        })
    });
    
        //     //catch error
        // .catch((dbErr) => {
        //     console
        //     console.error("Error inserting withdrawal:", dbErr.message);
        //     // Database error, so show the form again with a generic message.
        //     res.status(500).render("addWithdrawal",
        //         { loggedIn: req.session.isLoggedIn, error_message: "Unable to save. Please try again.",
        //             level:req.session.level
        //          });
        // });
    }
);

app.get('/displayWithdrawl/:depositID', (req, res) => {
    if (!req.session.isLoggedIn) {
      return res.redirect('/login');
    }
    
  
    const accountID = req.session.accountID;
    const depositID = Number(req.params.depositID);
  
    knex('accounts')
      .where('accountID', accountID)
      .first()
      .then((account) => {
        if (!account) {
          return res.redirect('/displayDeposits');
        }
  
        // 1) get all deposits for this account (for running balance)
        knex('deposits')
          .where('accountID', accountID)
          .orderBy('depositDate', 'asc')
          .then((deposits) => {
            if (!deposits || deposits.length === 0) {
              return res.redirect('/displayDeposits');
            }
  
            // 2) total withdrawals per deposit for this account
            knex('withdrawals')
              .where('accountID', accountID)
              .groupBy('depositID')
              .select('depositID')
              .sum({ totalCost: 'cost' })
              .then((withdrawalSummary) => {
                const withdrawalMap = {};
                withdrawalSummary.forEach((w) => {
                  withdrawalMap[w.depositID] = Number(w.totalCost);
                });
  
                // 3) running balances for all deposits
                const initialBalance = Number(account.initialBalance || 0);
                let runningBalance = initialBalance;
  
                deposits.forEach((d) => {
                  const depositAmount = Number(d.depositAmount || 0);
                  const totalWithdrawals = withdrawalMap[d.depositID] || 0;
  
                  d.startBalance = runningBalance;
                  d.endBalance = runningBalance + depositAmount - totalWithdrawals;
  
                  runningBalance = d.endBalance;
                });
  
                // 4) find THIS deposit (cast both sides to Number)
                const thisDeposit = deposits.find(
                  (d) => Number(d.depositID) === depositID
                );
  
                if (!thisDeposit) {
                  console.log('No matching deposit for ID:', depositID);
                  return res.redirect('/displayDeposits');
                }
  
                // 5) get withdrawals for this deposit
                knex('withdrawals')
                  .where({
                    accountID: accountID,
                    depositID: depositID
                  })
                  .orderBy('withdrawalDate', 'asc')
                  .then((withdrawals) => {
                    const totalCost = withdrawals.reduce((sum, w) => {
                      return sum + Number(w.cost || 0);
                    }, 0);
  
                    const costSum = { total_cost: totalCost };
  
                    res.render('displayWithdrawls', {
                      withdrawals,
                      deposit: thisDeposit,
                      costSum,
                      error_message: '',
                      loggedIn: req.session.isLoggedIn,
                      level: req.session.level
                    });
                  })
                  .catch((err) => {
                    console.error('Error loading withdrawls list:', err);
                    res.redirect('/displayDeposits');
                  });
              })
              .catch((err) => {
                console.error('Error summarizing withdrawls:', err);
                res.redirect('/displayDeposits');
              });
          })
          .catch((err) => {
            console.error('Error loading deposits for account:', err);
            res.redirect('/displayDeposits');
          });
      })
      .catch((err) => {
        console.error('Error loading account:', err);
        res.redirect('/displayDeposits');
      });
});

app.get('/editWithdrawal/:withdrawalID', (req, res)=> {
  knex('withdrawals')
  .where('withdrawalID', req.params.withdrawalID)
  .first()
  .then((selectedwithdrawal) => {
    if (!selectedwithdrawal.accountID === req.session.accountID || !req.session.isLoggedIn){
      console.log(`User with account ID '${req.session.accountID}' tried to edit a withdrawal with an account ID of '${selectedwithdrawal.accountID}'`)
      res.redirect('/')
    } else {
      res.render('editWithdrawal',
        {withdrawal : selectedwithdrawal,
         'error_message' : ''
        }
      )
    }
  })
});

app.post('/editWithdrawal/:withdrawalID', (req, res)=> {
      //grab the vairables the deposit would like to edit the data row to be
      const { date, cost, category, subcategory, location, notes } = req.body;
      // another paramter in case some how the form gets submitted without the fields filled
      if ( !date || !cost || !category || !subcategory ) {
          return knex("withdrawals")
              .where({ withdrawalID: req.params.withdrawalID })
              .first()
              .then((withdrawal) => {
  
                  if (!withdrawal) {
                      return res.status(404).render("index", {
                        loggedIn : req.session.isLoggedIn,
                        accountID : req.session.accountID,
                        username : req.session.username,
                        level : req.session.level,
                        firstName : req.session.firstName,
                        error_message : 'Error in editting'
                      });
                  }
                  res.status(400).render("index", {
                    loggedIn : req.session.isLoggedIn,
                    accountID : req.session.accountID,
                    username : req.session.username,
                    level : req.session.level,
                    firstName : req.session.firstName,
                    error_message : 'Error in editting'
                  });
              })
              // catch errors and rerender with errors
              .catch((err) => {
                  console.error("Error fetching user:", err.message);
                  res.status(500).render("index", {
                    loggedIn : req.session.isLoggedIn,
                    accountID : req.session.accountID,
                    username : req.session.username,
                    level : req.session.level,
                    firstName : req.session.firstName,
                    error_message : 'Error in editting'
                  });
              });
      }
      // store the new vairables
      const updatedWithdrawal = {
        withdrawalDate: date,
        cost,
        category,
        subcategory,
        location,
        notes
      }
      // add/insert the new vairables into the table in the database
      knex("withdrawals")
          .where({ withdrawalID: req.params.withdrawalID })
          .update(updatedWithdrawal)
          .then((rowsUpdated) => {
              if (rowsUpdated === 0) {
                  return res.status(404).render("index", {
                    loggedIn : req.session.isLoggedIn,
                    accountID : req.session.accountID,
                    username : req.session.username,
                    level : req.session.level,
                    firstName : req.session.firstName,
                    error_message : 'Error in editting'
                  });
              }
              console.log(`User with accountID ${req.session.accountID} editted a deposit`)
              knex('withdrawals')
              .where({
                withdrawalID: req.params.withdrawalID,
                accountID: req.session.accountID
              })
              .first()
              .then((withdrawal) => {
                if (!withdrawal) res.status(404).send('Withdrawal not found');
                res.redirect(`/displayWithdrawl/${withdrawal.depositID}`);

              })
              
          })
          // catch errors and rerender with errors
          .catch((err) => {
              console.error("Error updating user:", err.message);
              knex("users")
                  .where({ withdrawalID: req.params.withdrawalID })
                  .first()
                  .then((withdrawal) => {
                      if (!withdrawal) {
                          return res.status(404).render("index", {
                            loggedIn : req.session.isLoggedIn,
                            accountID : req.session.accountID,
                            username : req.session.username,
                            level : req.session.level,
                            firstName : req.session.firstName,
                            error_message : 'Error in editting'
                          });
                      }
                      res.status(500).render("index", {
                        loggedIn : req.session.isLoggedIn,
                        accountID : req.session.accountID,
                        username : req.session.username,
                        level : req.session.level,
                        firstName : req.session.firstName,
                        error_message : 'Error in editting'
                      });
                  })
                  // catch errors and rerender with errors
                  .catch((fetchErr) => {
                      console.error("Error fetching withdrawals after update failure:", fetchErr.message);
                      res.status(500).render("index", {
                        loggedIn : req.session.isLoggedIn,
                        accountID : req.session.accountID,
                        username : req.session.username,
                        level : req.session.level,
                        firstName : req.session.firstName,
                        error_message : 'Error in editting'
                      });
                  });
          });
});

app.post('/deleteWithdrawal/:withdrawalID', (req, res) => {
  const withdrawalID = Number(req.params.withdrawalID);

  if (!req.session.isLoggedIn) return res.redirect('/login');
  if (req.session.level !== 'M') return res.status(403).send('Forbidden');

  knex('withdrawals')
    .where({ withdrawalID, accountID: req.session.accountID })
    .first('depositID')
    .then((withdrawal) => {
      if (!withdrawal) {
        return res.status(403).render('index', {
          loggedIn: req.session.isLoggedIn,
          accountID: req.session.accountID,
          username: req.session.username,
          level: req.session.level,
          firstName: req.session.firstName,
          error_message: 'Error: Cannot delete that withdrawal!'
        });
      }

      const depositID = withdrawal.depositID;

      return knex('withdrawals')
        .where({ withdrawalID, accountID: req.session.accountID })
        .del()
        .then((rowsDeleted) => {
          if (rowsDeleted === 0) return res.status(404).send('Withdrawal not found');
          return res.redirect(`/displayWithdrawl/${depositID}`);
        });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send('Error deleting withdrawal');
    });
});
// /////////////////////// - ANALYSIS - ///////////////////////////////
app.get('/displayAnalysis/:depositID', (req, res) => {
  if (!req.session.isLoggedIn) return res.redirect('/login');

  const accountID = req.session.accountID;
  const depositID = Number(req.params.depositID);

  knex('accounts')
    .where('accountID', accountID)
    .first()
    .then((account) => {
      if (!account) return res.redirect('/displayDeposits');

      knex('deposits')
        .where('accountID', accountID)
        .orderBy('depositDate', 'asc')
        .then((deposits) => {
          if (!deposits || deposits.length === 0) return res.redirect('/displayDeposits');

          knex('withdrawals')
            .where('accountID', accountID)
            .groupBy('depositID')
            .select('depositID')
            .sum({ totalCost: 'cost' })
            .then((withdrawalSummary) => {
              const withdrawalMap = {};
              withdrawalSummary.forEach((w) => {
                withdrawalMap[w.depositID] = Number(w.totalCost);
              });

              const initialBalance = Number(account.initialBalance || 0);
              let runningBalance = initialBalance;

              deposits.forEach((d) => {
                const depositAmount = Number(d.depositAmount || 0);
                const totalWithdrawals = withdrawalMap[d.depositID] || 0;

                d.startBalance = runningBalance;
                d.endBalance = runningBalance + depositAmount - totalWithdrawals;

                runningBalance = d.endBalance;
              });

              const thisDeposit = deposits.find((d) => Number(d.depositID) === depositID);
              if (!thisDeposit) return res.redirect('/displayDeposits');

              knex('withdrawals')
                .where({ accountID: accountID, depositID: depositID })
                .orderBy('withdrawalDate', 'desc')
                .then((withdrawals) => {
                  knex('withdrawals')
                    .sum({ total_cost: 'cost' })
                    .where({ accountID: accountID, depositID: thisDeposit.depositID })
                    .groupBy('depositID')
                    .first()
                    .then((costSum) => {

                      // FAST python run: graphs + payload, no AI
                      let UserAccountID = req.session.accountID

                      const py = spawn(PYTHON, [
                        scriptPath,
                        String(thisDeposit.depositID),
                        String(UserAccountID),
                        'fast'
                      ]);


                      let pyOutput = '';
                      let pyErr = "";
                      py.stdout.on('data', (data) => { pyOutput += data.toString(); });
                      py.stderr.on("data", (d) => (pyErr += d.toString()));

                      py.on("error", (err) => {
                        console.error("Python spawn failed:", err);
                        return res.status(500).send("Python not available on server.");
                      });
                      
                      py.on("close", (code) => {
                        if (code !== 0) {
                          console.error("Python exited nonzero:", code, pyErr);
                          return res.status(500).send("Analysis failed on server.");
                        }

                      py.on('close', () => {
                        let analysis = { AI_Recomendation: '' };
                        try {
                          const parsed = JSON.parse(pyOutput);
                          analysis.payload = parsed.payload; // optional if you want it later
                        } catch (e) {
                          console.error('Error parsing FAST Python output', e);
                        }

                        res.render('displayAnalysis', {
                          error_message: withdrawals ? '' : 'No Withdrawls found for this payment peroid',
                          loggedIn: req.session.isLoggedIn,
                          username: req.session.username,
                          level: req.session.level,
                          withdrawals: withdrawals || [],
                          deposit: thisDeposit,
                          costSum,
                          analysis
                        });
                      });
                    });
                });
            });
        });
    })
    .catch((err) => {
      console.error(err);
      res.redirect('/displayDeposits');
    });
});

app.get('/analysisAI/:depositID', (req, res) => {
  if (!req.session.isLoggedIn) return res.status(401).json({ error: 'Not logged in' });

  const accountID = req.session.accountID;
  const depositID = Number(req.params.depositID);

  // Verify deposit belongs to this account
  knex('deposits')
    .where({ accountID: accountID, depositID: depositID })
    .first()
    .then((dep) => {
      if (!dep) return res.status(404).json({ error: 'Deposit not found' });

      const py = spawn(PYTHON, [
        scriptPath,
        String(depositID),
        String(accountID),
        'ai'
      ]);

      let pyOutput = '';
      let pyErr = '';

      py.stdout.on('data', (d) => { pyOutput += d.toString(); });
      py.stderr.on('data', (d) => { pyErr += d.toString(); });

      py.on('close', () => {
        if (pyErr) console.error('Python AI stderr:', pyErr);

        try {
          const parsed = JSON.parse(pyOutput);
          return res.json({ html: parsed.AI_Recomendation || '' });
        } catch (e) {
          console.error('Error parsing AI output:', e);
          return res.status(500).json({ error: 'AI generation failed' });
        }
      });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    });
});

// /////////////////////// - ADD CSV - ///////////////////////////////
app.get('/importCSV', (req, res)=>{
  res.redirect('/comingSoon')
  // res.render('addCSV', {
  //   error:''
  // })
})


app.post('/importCSV', upload.single('csvfile'), async (req, res) => {
  if (!req.session.isLoggedIn) return res.redirect('/login');
  
  const accountID = req.session.accountID;
  if (!req.file) {
    return res.render('importCsv', { error: 'No file uploaded.' });
  }

  if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
    return res.render('importCsv', { error: 'File must be a CSV.' });
  }

  if (req.file.size > 5 * 1024 * 1024) {
    return res.render('importCsv', { error: 'CSV too large.' });
  }

  
})

app.post('/startManually', (req, res) => {
  if (!req.session.isLoggedIn) return res.redirect('/login');

  const accountID = req.session.accountID;
  const initialBalanceRaw = req.body.initialBalance;

  const initialBalance = Number(initialBalanceRaw);

  if (Number.isNaN(initialBalance) || initialBalance < 0) {
    return res.render('welcome', {
      loggedIn: true,
      error: 'Initial balance must be a valid number (0 or greater).'
    });
  }

  knex('accounts')
    .where('accountID', accountID)
    .update({ initialBalance })
    .then(() => {
      res.redirect('/displayDeposits');
    })
    .catch(err => {
      console.error(err);
      res.status(500).send('Database error updating initial balance');
    });
});

app.get('/comingSoon', (req, res) => {
  res.render('underConstruction', {
    loggedIn: req.session.isLoggedIn
  });
});