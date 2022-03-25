/* `Meteor.userId()` can only be called inside a Meteor method. Return `null` otherwise. */
export function getUserId() {
  try {
    return Meteor.userId();
  } catch (e) {
    return null;
  }
}
