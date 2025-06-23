import React from "react";
interface Users {
  id: number;
  name: string;
}
const TestPage = async () => {
  const res = await fetch("https://jsonplaceholder.typicode.com/users", {
    // cache: "no-store",
    // next: { revalidate: 10 },
    cache: "no-store",
  });
  const users: Users[] = await res.json();
  return (
    <>
      <h1>TestPage</h1>
      <p>{new Date().toLocaleTimeString()}</p>
      <ol>
        {users.map((user, i) => (
          <li key={user.id}>
            {i + 1}. {user.name}
          </li>
        ))}
      </ol>
    </>
  );
};

export default TestPage;
