import Ajv from "ajv";
import recipe from "../schema/kinetic-recipe-1.json" with {type:"json"};

const validate = new Ajv().compile(recipe);
export function validateKineticRecipe(value) {
  if (!validate(value)) throw Error("Invalid kinetic region recipe: "+
    validate.errors.map(e=>e.instancePath+" "+e.message).join(", "));
}
