import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const addNessZionaData = async () => {
  const cityData = {
    name: "Ness Ziona", // השם המדויק באנגלית עבור ה-API של מזג האוויר
    rating: 4.7,
    travelers: "850",
    description: "A peaceful city known for its Science Park, orange groves heritage, and green hills.",
    
    // הוידג'טים (ללא weather)
    widgets: {
      airport: {
        name: "Ben Gurion (TLV)",
        distance: "20 min drive"
      },
      sim: {
        provider: "Partner / Pelephone",
        price: "35₪ / 100GB"
      },
      transport: {
        type: "Train (Science Park St.)",
        recommendation: "Moovit / Gett"
      }
    },

    // מידע חיוני
    essentialInfo: {
      hotel: "Leonardo Boutique (Science Park)", // המלון הכי קרוב ורלוונטי
      driver: "Ness Ziona Taxi - 24/7"
    }
  };

  try {
    // הנתיב: countries -> Israel -> cities -> Ness Ziona
    await setDoc(doc(db, "countries", "Israel", "cities", "Ness Ziona"), cityData);
    
    alert("נס ציונה נוספה בהצלחה! 🍊");
  } catch (error) {
    console.error("Error writing document: ", error);
    alert("שגיאה בהוספת העיר");
  }
};



export default function CommunityScreen() {
  return (
    <View style={styles.container}>
      <Text>Community Screen Placeholder</Text>
      <TouchableOpacity 
        onPress={addNessZionaData}
        style={{
          backgroundColor: 'green',
          padding: 15,
          margin: 20,
          borderRadius: 10,
          alignItems: 'center'
        }}>
        <Text style={{ color: 'white', fontWeight: 'bold' }}>
          הוסף את כפר סבא ל-Firebase
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
