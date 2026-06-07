int pin_list[5] = {13,12,14,27,26};
int num = sizeof(pin_list)/sizeof(pin_list[0]);
 
 void setup() {
  for(int i=0;i<num; i++){
    pinMode(pin_list[i],OUTPUT);
  }
}

void loop() {
  // put your main code here, to run repeatedly:
  for(int i=0;i<num; i++){
   digitalWrite(pin_list[i],HIGH);  
   delay(1000); 
  }

  for(int i=num - 1;i>=0; i--){
   digitalWrite(pin_list[i],LOW);  
   delay(1000); 
  }  
}
