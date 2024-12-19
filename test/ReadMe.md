The file testhh631808345.txt should be copied to your profile folder, which is determined
in code like this:
```    const homeDir = process.env.APPDATA
        || (process.platform === 'darwin'
            ? path.join(process.env.HOME,"Library","Preferences")
            : path.join(process.env.HOME,".local","share"));
```
When you enter the password "TestPW", this is the file that will be used. You can edit
and make copies of it for various testing situations.
