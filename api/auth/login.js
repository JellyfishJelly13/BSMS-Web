const { db } = require("../_firebase");
const bcrypt = require("bcrypt");

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }


    const { username, password } = req.body;


    if (!username || !password) {
        return res.status(400).json({
            error: "Username and password required"
        });
    }


    try {

        const snapshot = await db
            .ref(`/accounts/${username}`)
            .once("value");


        const userData = snapshot.val();


        if (!userData) {
            return res.status(404).json({
                error: "Account not found"
            });
        }


        let isValid = false;


        // New bcrypt passwords
        if (userData.password.startsWith("$2b$")) {

            isValid = await bcrypt.compare(
                password,
                userData.password
            );

        } 
        
        // Old passwords (migration)
        else {

            const decodedPassword = decodeURIComponent(
                atob(userData.password)
            );

            isValid = password === decodedPassword;

        }


        if (!isValid) {
            return res.status(401).json({
                error: "Incorrect password"
            });
        }


        // Never send password to browser
        delete userData.password;


        return res.status(200).json({
            success: true,
            user: username,
            accountData: userData
        });


    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: "Server error"
        });

    }
}
