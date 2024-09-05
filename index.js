const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/files', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  secret: 'KzACG_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Helper functions
function readJSONFile(filename) {
  try {
    const data = fs.readFileSync(filename, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${filename}:`, err);
    return [];
  }
}

function writeJSONFile(filename, data) {
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const users = readJSONFile('users.json');

  if (users.find(user => user.username === username)) {
    return res.status(400).send('Username already exists');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ username, password: hashedPassword });
  writeJSONFile('users.json', users);

  res.status(201).send('User registered successfully');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = readJSONFile('users.json');
  const user = users.find(user => user.username === username);

  if (user && await bcrypt.compare(password, user.password)) {
    req.session.user = { username: user.username };
    res.send('Logged in successfully');
  } else {
    res.status(401).send('Invalid username or password');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('Could not log out, please try again');
    }
    res.send('Logged out successfully');
  });
});

// Multiple file upload
app.post('/upload', upload.array('files', 10), (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('You must be logged in to upload a post');
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).send('No files uploaded.');
  }

  const files = req.files.map(file => file.filename);
  const post = {
    title: req.body.title,
    content: req.body.content,
    files: files,
    author: req.session.user.username,
    date: new Date().toISOString()
  };

  const posts = readJSONFile('posts.json');
  posts.push(post);
  writeJSONFile('posts.json', posts);

  res.redirect('/');
});

app.get('/posts', (req, res) => {
  const posts = readJSONFile('posts.json');
  res.json(posts);
});

app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(__dirname, 'uploads', filename);
  res.download(filepath, (err) => {
    if (err) {
      res.status(404).send('File not found');
    }
  });
});

app.delete('/posts/:index', (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('You must be logged in to delete a post');
  }

  const index = parseInt(req.params.index);
  const posts = readJSONFile('posts.json');

  if (index >= 0 && index < posts.length) {
    if (posts[index].author !== req.session.user.username) {
      return res.status(403).send('You can only delete your own posts');
    }

    const deletedPost = posts.splice(index, 1)[0];
    writeJSONFile('posts.json', posts);

    if (deletedPost.files) {
      deletedPost.files.forEach(file => {
        fs.unlinkSync(path.join(__dirname, 'uploads', file));
      });
    }

    res.send('Post deleted successfully');
  } else {
    res.status(400).send('Invalid post index');
  }
});

app.put('/posts/:index', (req, res) => {
  if (!req.session.user) {
    return res.status(401).send('You must be logged in to edit a post');
  }

  const index = parseInt(req.params.index);
  const posts = readJSONFile('posts.json');

  if (index >= 0 && index < posts.length) {
    if (posts[index].author !== req.session.user.username) {
      return res.status(403).send('You can only edit your own posts');
    }

    posts[index] = { ...posts[index], ...req.body, date: new Date().toISOString() };
    writeJSONFile('posts.json', posts);

    res.send('Post updated successfully');
  } else {
    res.status(400).send('Invalid post index');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});