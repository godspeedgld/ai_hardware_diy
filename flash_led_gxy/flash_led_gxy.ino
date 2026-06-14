int led_pin = 12;  

void setup() {
  // put your setup code here, to run once:
  pinMode(led_pin, OUTPUT);
}

void loop() {
  // put your main code here, to run repe
 digitalWrite(led_pin, HIGH);                                                     
delay(1000);
digitalWrite(led_pin, LOW);
delay(1000);
}
